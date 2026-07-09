import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { withPermission } from '@/lib/rbac-server';
import { canManageRole } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { userCreateSchema } from '@/lib/schemas-users';

export const GET = withPermission('USERS_VIEW', async (_req, session) => {
  const tenantUsers = await prisma.tenantUser.findMany({
    where: { tenantId: session.tenantId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({
    users: tenantUsers.map((tu: {id: string; userId: string; role: string; status: string; createdAt: Date; user: {id: string; name: string; email: string; avatarUrl?: string | null; createdAt: Date}}) => ({
      tenantUserId: tu.id,
      userId: tu.userId,
      name: tu.user.name,
      email: tu.user.email,
      avatarUrl: tu.user.avatarUrl,
      role: tu.role,
      status: tu.status,
      createdAt: tu.createdAt,
    })),
  });
});

export const POST = withPermission('USERS_CREATE_DIRECT', async (req, session) => {
  try {
    const body = await req.json();
    const parsed = userCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    if (!canManageRole(session.role, parsed.data.role, session.globalRole)) {
      return NextResponse.json({ error: 'Você não tem permissão para criar usuário com este papel.' }, { status: 403 });
    }

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    let user = existing;
    if (!user) {
      const passwordHash = await hashPassword(parsed.data.password);
      user = await prisma.user.create({ data: { name: parsed.data.name, email: parsed.data.email, passwordHash } });
    }

    const alreadyInTenant = await prisma.tenantUser.findFirst({ where: { tenantId: session.tenantId, userId: user.id } });
    if (alreadyInTenant) {
      return NextResponse.json({ error: 'Usuário já pertence a esta empresa.' }, { status: 409 });
    }

    const tu = await prisma.tenantUser.create({
      data: { tenantId: session.tenantId, userId: user.id, role: parsed.data.role as any, status: 'active' },
    });

    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'user', entityId: user.id, action: 'user.created',
      metadata: { role: parsed.data.role, email: user.email },
    });

    return NextResponse.json({
      message: 'Usuário criado com sucesso.',
      user: {
        tenantUserId: tu.id, userId: user.id, name: user.name, email: user.email,
        role: tu.role, status: tu.status, createdAt: tu.createdAt,
      },
    });
  } catch (e: any) {
    console.error('users.create error', e);
    return NextResponse.json({ error: 'Erro ao criar usuário' }, { status: 500 });
  }
});
