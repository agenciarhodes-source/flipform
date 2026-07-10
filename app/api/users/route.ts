import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { withPermission } from '@/lib/rbac-server';
import { canManageRole } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { userCreateSchema } from '@/lib/schemas-users';

const BLOCKED_TENANT_STATUSES = new Set(['suspended', 'blocked', 'canceled', 'inactive']);
const OTHER_TENANT_ERROR = 'Este e-mail já possui acesso em outra empresa. Utilize o fluxo de vínculo ou redefinição de senha.';
const ALREADY_IN_TENANT_ERROR = 'Este usuário já pertence a esta empresa.';

function accessStatus(allowed?: { active: boolean; status: string } | null) {
  if (!allowed) return 'pending';
  if (allowed.active && allowed.status === 'active') return 'authorized';
  if (!allowed.active || ['blocked', 'revoked', 'inactive'].includes(allowed.status)) return 'blocked';
  return 'pending';
}

export const GET = withPermission('USERS_VIEW', async (_req, session) => {
  const tenantUsers = await prisma.tenantUser.findMany({
    where: { tenantId: session.tenantId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const emails = tenantUsers.map((tu) => tu.user.email.trim().toLowerCase());
  const allowedUsers = await prisma.allowedUser.findMany({
    where: { tenantId: session.tenantId, email: { in: emails } },
    select: { email: true, active: true, status: true },
  });
  const allowedByEmail = new Map(allowedUsers.map((allowed) => [allowed.email.trim().toLowerCase(), allowed]));

  return NextResponse.json({
    users: tenantUsers.map((tu: {id: string; userId: string; role: string; status: string; createdAt: Date; user: {id: string; name: string; email: string; avatarUrl?: string | null; createdAt: Date}}) => {
      const allowed = allowedByEmail.get(tu.user.email.trim().toLowerCase());
      return {
        tenantUserId: tu.id,
        userId: tu.userId,
        name: tu.user.name,
        email: tu.user.email,
        avatarUrl: tu.user.avatarUrl,
        role: tu.role,
        status: tu.status,
        accessAuthorized: !!allowed && allowed.active && allowed.status === 'active',
        accessStatus: accessStatus(allowed),
        createdAt: tu.createdAt,
      };
    }),
  });
});

export const POST = withPermission('USERS_CREATE_DIRECT', async (req, session) => {
  try {
    const body = await req.json();
    const parsed = userCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    const email = parsed.data.email.trim().toLowerCase();
    const role = parsed.data.role;

    if (!canManageRole(session.role, role, session.globalRole)) {
      return NextResponse.json({ error: 'Você não tem permissão para criar usuário com este papel.' }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: session.tenantId }, select: { id: true, status: true } });
      if (!tenant || BLOCKED_TENANT_STATUSES.has(String(tenant.status))) {
        throw Object.assign(new Error('Esta empresa não está ativa para criar usuários.'), { status: 403 });
      }

      const existingUser = await tx.user.findUnique({
        where: { email },
        include: { tenantUsers: { select: { id: true, tenantId: true, status: true, role: true } } },
      });

      let user: any = existingUser;
      const currentTenantUser = existingUser?.tenantUsers.find((tu) => tu.tenantId === session.tenantId);

      if (currentTenantUser?.status === 'active') {
        throw Object.assign(new Error(ALREADY_IN_TENANT_ERROR), { status: 409 });
      }

      const hasActiveOtherTenant = existingUser?.tenantUsers.some((tu) => tu.tenantId !== session.tenantId && tu.status === 'active') ?? false;
      if (hasActiveOtherTenant) {
        throw Object.assign(new Error(OTHER_TENANT_ERROR), { status: 409 });
      }

      if (!user) {
        const passwordHash = await hashPassword(parsed.data.password);
        user = await tx.user.create({ data: { name: parsed.data.name, email, passwordHash } });
      } else if (!currentTenantUser) {
        const passwordHash = await hashPassword(parsed.data.password);
        user = await tx.user.update({ where: { id: user.id }, data: { name: parsed.data.name, email, passwordHash } });
      } else {
        user = await tx.user.update({ where: { id: user.id }, data: { name: parsed.data.name, email } });
      }

      const tenantUser = currentTenantUser
        ? await tx.tenantUser.update({ where: { id: currentTenantUser.id }, data: { role: role as any, status: 'active' } })
        : await tx.tenantUser.create({ data: { tenantId: session.tenantId, userId: user.id, role: role as any, status: 'active' } });

      await tx.allowedUser.upsert({
        where: { tenantId_email: { tenantId: session.tenantId, email } },
        create: {
          tenantId: session.tenantId,
          email,
          role,
          active: true,
          status: 'active',
          source: 'direct_user_creation',
          invitedBy: session.userId,
          acceptedAt: new Date(),
        },
        update: {
          role,
          active: true,
          status: 'active',
          source: 'direct_user_creation',
          acceptedAt: new Date(),
        },
      });

      return { user, tenantUser };
    });

    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'user', entityId: result.user.id, action: 'user.created',
      metadata: { role, email, creationMode: 'direct', tenantUserStatus: 'active', allowedUserStatus: 'active' },
    });

    return NextResponse.json({
      message: 'Usuário criado e liberado para acesso.',
      user: {
        tenantUserId: result.tenantUser.id,
        userId: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.tenantUser.role,
        status: result.tenantUser.status,
        accessAuthorized: true,
      },
    });
  } catch (e: any) {
    if (e?.status) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('users.create error', { message: e?.message, code: e?.code, meta: e?.meta, stack: e?.stack });
    return NextResponse.json({ error: 'Erro ao criar usuário. Nenhum acesso parcial foi salvo.' }, { status: 500 });
  }
});
