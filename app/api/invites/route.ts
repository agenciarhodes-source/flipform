import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit, randomToken } from '@/lib/audit';
import { inviteCreateSchema } from '@/lib/schemas-users';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const GET = withPermission('USERS_VIEW', async (_req, session) => {
  const invites = await prisma.invite.findMany({
    where: { tenantId: session.tenantId, status: 'pending' },
    include: { inviter: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ invites });
});

export const POST = withPermission('USERS_INVITE', async (req, session) => {
  try {
    const rlTenant = rateLimit({ key: `invite:create:tenant:${session.tenantId}`, limit: 20, windowMs: 60 * 60 * 1000 });
    if (!rlTenant.allowed) return rateLimitResponse(rlTenant);
    const rlUser = rateLimit({ key: `invite:create:user:${session.userId}`, limit: 10, windowMs: 60 * 60 * 1000 });
    if (!rlUser.allowed) return rateLimitResponse(rlUser);

    const body = await req.json();
    const parsed = inviteCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    if (parsed.data.role === 'owner' && session.role !== 'owner') {
      return NextResponse.json({ error: 'Apenas o owner pode convidar como owner.' }, { status: 403 });
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();

    // limite de plano (usuários ativos + convites pendentes)
    const [tenant, activeUsers, pendingInvites] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { plan: { select: { maxUsers: true } } } }),
      prisma.tenantUser.count({ where: { tenantId: session.tenantId, status: 'active' } }),
      prisma.invite.count({ where: { tenantId: session.tenantId, status: 'pending' } }),
    ]);
    const maxUsers = tenant?.plan?.maxUsers ?? 0;
    if (maxUsers > 0 && activeUsers + pendingInvites >= maxUsers) {
      return NextResponse.json({ error: 'Limite de usuários do plano atingido.', code: 'PLAN_LIMIT_REACHED' }, { status: 403 });
    }

    // Já é membro?
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      const member = await prisma.tenantUser.findFirst({
        where: { tenantId: session.tenantId, userId: existingUser.id },
      });
      if (member) return NextResponse.json({ error: 'Este usuário já faz parte deste tenant.', code: 'USER_ALREADY_IN_TENANT' }, { status: 409 });
    }

    // Convite pendente?
    const pending = await prisma.invite.findFirst({
      where: { tenantId: session.tenantId, email: normalizedEmail, status: 'pending' },
    });
    if (pending) return NextResponse.json({ error: 'Já existe um convite pendente para este e-mail.', code: 'INVITE_ALREADY_PENDING' }, { status: 409 });

    const token = randomToken(24);
    const expiresAt = new Date(Date.now() + 7 * 86400000); // 7 dias
    const invite = await prisma.invite.create({
      data: {
        tenantId: session.tenantId,
        email: normalizedEmail,
        role: parsed.data.role as any,
        token,
        invitedBy: session.userId,
        status: 'pending',
        expiresAt,
      },
    });
    await prisma.allowedUser.upsert({
      where: { email: normalizedEmail },
      update: { tenantId: session.tenantId, role: parsed.data.role, status: 'pending', active: true, source: 'invite' },
      create: { email: normalizedEmail, tenantId: session.tenantId, role: parsed.data.role, status: 'pending', active: true, source: 'invite', invitedBy: session.userId },
    });

    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'invite', entityId: invite.id, action: 'invite.created',
      metadata: { email: parsed.data.email, role: parsed.data.role },
    });

    return NextResponse.json({
      invite: {
        id: invite.id, email: invite.email, role: invite.role,
        token: invite.token, expiresAt: invite.expiresAt,
      },
    });
  } catch (e) {
    console.error('invite.create error', e);
    return NextResponse.json({ error: 'Erro ao convidar' }, { status: 500 });
  }
});