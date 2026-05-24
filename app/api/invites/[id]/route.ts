import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const DELETE = withPermission('USERS_INVITE', async (_req, session, ctx: { params: { id: string } }) => {
  const rl = rateLimit({ key: `invite:revoke:user:${session.userId}`, limit: 20, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const invite = await prisma.invite.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!invite) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (invite.status !== 'pending') return NextResponse.json({ error: 'Convite não está pendente.' }, { status: 409 });
  await prisma.invite.update({ where: { id: invite.id }, data: { status: 'revoked' } });
  await prisma.allowedUser.updateMany({ where: { tenantId: session.tenantId, email: invite.email, acceptedAt: null }, data: { active: false, status: 'revoked' } });
  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'invite', entityId: invite.id, action: 'invite.revoked',
    metadata: { email: invite.email, role: invite.role },
  });
  return NextResponse.json({ ok: true });
});

export const POST = withPermission('USERS_INVITE', async (_req, session, ctx: { params: { id: string } }) => {
  const rl = rateLimit({ key: `invite:resend:id:${ctx.params.id}`, limit: 5, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const invite = await prisma.invite.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!invite) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (invite.status !== 'pending') return NextResponse.json({ error: 'Convite não está pendente.' }, { status: 409 });
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  const updated = await prisma.invite.update({ where: { id: invite.id }, data: { expiresAt } });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'invite', entityId: invite.id, action: 'invite.resent', metadata: { email: invite.email } });
  return NextResponse.json({ ok: true, invite: { id: updated.id, expiresAt: updated.expiresAt } });
});
