import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';

export const DELETE = withPermission('USERS_INVITE', async (_req, session, ctx: { params: { id: string } }) => {
  const invite = await prisma.invite.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!invite) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  await prisma.invite.update({ where: { id: invite.id }, data: { status: 'revoked' } });
  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'invite', entityId: invite.id, action: 'invite.revoked',
    metadata: { email: invite.email, role: invite.role },
  });
  return NextResponse.json({ ok: true });
});
