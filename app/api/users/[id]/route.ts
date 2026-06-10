import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { userUpdateSchema } from '@/lib/schemas-users';

export const PUT = withPermission('USERS_EDIT', async (req, session, ctx: { params: { id: string } }) => {
  try {
    const body = await req.json();
    const parsed = userUpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    // Encontra o tenant_user dentro deste tenant (id = tenantUserId)
    const target = await prisma.tenantUser.findFirst({
      where: { id: ctx.params.id, tenantId: session.tenantId },
      include: { user: true },
    });
    if (!target) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    // Regras:
    // - admin não pode rebaixar/inativar/alterar owner
    // - apenas owner pode promover alguém a owner
    // - não se pode rebaixar a si mesmo sem ser owner
    if (target.role === 'owner' && session.role !== 'owner') {
      return NextResponse.json({ error: 'Você não pode alterar um owner.' }, { status: 403 });
    }
    if (parsed.data.role === 'owner' && session.role !== 'owner') {
      return NextResponse.json({ error: 'Apenas o owner pode promover a owner.' }, { status: 403 });
    }
    if (target.userId === session.userId && parsed.data.role && parsed.data.role !== session.role) {
      return NextResponse.json({ error: 'Você não pode alterar seu próprio papel.' }, { status: 403 });
    }

    const updates: any = {};
    const userUpdates: any = {};
    if (parsed.data.role) updates.role = parsed.data.role;
    if (parsed.data.status) updates.status = parsed.data.status;
    if (parsed.data.name) userUpdates.name = parsed.data.name;

    await prisma.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
      if (Object.keys(updates).length) await tx.tenantUser.update({ where: { id: target.id }, data: updates });
      if (Object.keys(userUpdates).length) await tx.user.update({ where: { id: target.userId }, data: userUpdates });
    });

    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'user', entityId: target.userId,
      action: parsed.data.role ? 'user.role_changed' : (parsed.data.status ? `user.status_${parsed.data.status}` : 'user.updated'),
      metadata: { before: { role: target.role, status: target.status, name: target.user.name }, after: { ...updates, name: userUpdates.name } },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('users.update error', e);
    return NextResponse.json({ error: 'Erro ao atualizar usuário' }, { status: 500 });
  }
});

export const DELETE = withPermission('USERS_REMOVE', async (_req, session, ctx: { params: { id: string } }) => {
  const target = await prisma.tenantUser.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    include: { user: true },
  });
  if (!target) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  if (target.role === 'owner') {
    return NextResponse.json({ error: 'Não é possível remover o owner.' }, { status: 403 });
  }
  if (target.userId === session.userId) {
    return NextResponse.json({ error: 'Você não pode remover a si mesmo.' }, { status: 403 });
  }

  await prisma.tenantUser.delete({ where: { id: target.id } });

  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'user', entityId: target.userId, action: 'user.removed',
    metadata: { email: target.user.email, role: target.role },
  });

  return NextResponse.json({ ok: true });
});
