import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { cancelSubscription } from '@/lib/asaas';
import { logAudit } from '@/lib/audit';

export const POST = withAuth(async (req: NextRequest, session) => {
  const rlTenant = rateLimit({ key: `billing:cancel:tenant:${session.tenantId}`, limit: 5, windowMs: 60 * 60 * 1000 });
  if (!rlTenant.allowed) return rateLimitResponse(rlTenant);
  const rlIp = rateLimit({ key: `billing:cancel:ip:${getClientIp(req)}`, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rlIp.allowed) return rateLimitResponse(rlIp);
  if (!['owner', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Você não tem permissão para cancelar a assinatura.', code: 'FORBIDDEN' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || '').trim();
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { id: true, status: true } });
  if (!tenant || tenant.status === 'canceled') return NextResponse.json({ error: 'Nenhuma assinatura ativa encontrada.', code: 'NO_ACTIVE_SUBSCRIPTION' }, { status: 404 });

  const sub = await prisma.subscription.findFirst({ where: { tenantId: session.tenantId }, orderBy: { createdAt: 'desc' } });
  if (!sub) return NextResponse.json({ error: 'Nenhuma assinatura ativa encontrada.', code: 'NO_ACTIVE_SUBSCRIPTION' }, { status: 404 });
  if (sub.status === 'canceled') return NextResponse.json({ error: 'Esta assinatura já está cancelada.', code: 'ALREADY_CANCELED' }, { status: 400 });

  const provider = String(sub.provider || '').toLowerCase();
  if (provider === 'manual' || provider === 'courtesy') return NextResponse.json({ error: 'Assinaturas manuais ou de cortesia devem ser gerenciadas pelo administrador da plataforma.', code: 'MANUAL_SUBSCRIPTION_ADMIN_ONLY' }, { status: 400 });

  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'billing', entityId: sub.id, action: 'billing.cancel.requested', metadata: { reason: reason || null } });
  if (!sub.providerSubscriptionId) return NextResponse.json({ error: 'Não foi possível cancelar a assinatura no provedor.', code: 'PROVIDER_CANCEL_FAILED' }, { status: 400 });

  try { await cancelSubscription(sub.providerSubscriptionId); } catch {
    await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'billing', entityId: sub.id, action: 'billing.cancel.provider_failed' });
    return NextResponse.json({ error: 'Não foi possível cancelar a assinatura no provedor.', code: 'PROVIDER_CANCEL_FAILED' }, { status: 502 });
  }

  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'billing', entityId: sub.id, action: 'billing.cancel.provider_succeeded' });
  const updated = await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'canceled', canceledAt: new Date() } });
  await prisma.tenant.update({ where: { id: session.tenantId }, data: { status: 'canceled' } });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'billing', entityId: sub.id, action: 'billing.cancel.applied', metadata: { status: updated.status } });

  return NextResponse.json({ ok: true, status: 'canceled', message: 'Cancelamento solicitado com sucesso.' });
});
