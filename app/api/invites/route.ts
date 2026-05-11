import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit, randomToken } from '@/lib/audit';
import { inviteCreateSchema } from '@/lib/schemas-users';

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
    const body = await req.json();
    const parsed = inviteCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    if (parsed.data.role === 'owner' && session.role !== 'owner') {
      return NextResponse.json({ error: 'Apenas o owner pode convidar como owner.' }, { status: 403 });
    }

    // Já é membro?
    const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existingUser) {
      const member = await prisma.tenantUser.findFirst({
        where: { tenantId: session.tenantId, userId: existingUser.id },
      });
      if (member) return NextResponse.json({ error: 'Este e-mail já é membro da empresa.' }, { status: 409 });
    }

    // Convite pendente?
    const pending = await prisma.invite.findFirst({
      where: { tenantId: session.tenantId, email: parsed.data.email, status: 'pending' },
    });
    if (pending) return NextResponse.json({ error: 'Já existe convite pendente para este e-mail.' }, { status: 409 });

    const token = randomToken(24);
    const expiresAt = new Date(Date.now() + 7 * 86400000); // 7 dias
    const invite = await prisma.invite.create({
      data: {
        tenantId: session.tenantId,
        email: parsed.data.email,
        role: parsed.data.role as any,
        token,
        invitedBy: session.userId,
        status: 'pending',
        expiresAt,
      },
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
