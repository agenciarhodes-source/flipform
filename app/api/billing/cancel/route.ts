import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { cancelStripeSubscriptionAtPeriodEnd } from '@/lib/stripe/subscription-manage';

export const runtime = 'nodejs';

/**
 * The owner cancels the subscription. Paid through Stripe: it ends with the period already paid
 * (or the trial), so the company keeps its access until then. Other subscriptions are handled by
 * the platform admin.
 */
export const POST = withPermission('BILLING_MANAGE', async (req: NextRequest, session) => {
  const rlTenant = rateLimit({ key: `billing:cancel:tenant:${session.tenantId}`, limit: 5, windowMs: 60 * 60 * 1000 });
  if (!rlTenant.allowed) return rateLimitResponse(rlTenant);
  const rlIp = rateLimit({ key: `billing:cancel:ip:${getClientIp(req)}`, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rlIp.allowed) return rateLimitResponse(rlIp);
  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || '').trim().slice(0, 1000);
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { id: true, status: true } });
  if (!tenant || tenant.status === 'canceled') return NextResponse.json({ error: 'Nenhuma assinatura ativa encontrada.', code: 'NO_ACTIVE_SUBSCRIPTION' }, { status: 404 });

  const sub = await prisma.subscription.findFirst({ where: { tenantId: session.tenantId }, orderBy: { createdAt: 'desc' } });
  if (!sub) return NextResponse.json({ error: 'Nenhuma assinatura ativa encontrada.', code: 'NO_ACTIVE_SUBSCRIPTION' }, { status: 404 });
  if (sub.status === 'canceled') return NextResponse.json({ error: 'Esta assinatura já está cancelada.', code: 'ALREADY_CANCELED' }, { status: 400 });
  if (String(sub.provider || '').toLowerCase() !== 'stripe' || sub.status === 'courtesy') {
    return NextResponse.json({ error: 'O cancelamento desta assinatura é feito pelo administrador da plataforma. Fale com o suporte.', code: 'MANUAL_SUBSCRIPTION_ADMIN_ONLY' }, { status: 400 });
  }

  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'billing', entityId: sub.id, action: 'billing.cancel.requested', metadata: { reason: reason || null } });
  let endsAt: Date | null = null;
  try {
    endsAt = (await cancelStripeSubscriptionAtPeriodEnd(session.tenantId)).endsAt;
  } catch {
    await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'billing', entityId: sub.id, action: 'billing.cancel.provider_failed' });
    return NextResponse.json({ error: 'Não foi possível cancelar a assinatura agora. Tente de novo em instantes.', code: 'PROVIDER_CANCEL_FAILED' }, { status: 502 });
  }
  await logAudit({
    tenantId: session.tenantId, userId: session.userId, entityType: 'billing', entityId: sub.id,
    action: 'billing.cancel.scheduled', metadata: { endsAt: endsAt ? endsAt.toISOString() : null },
  });

  const until = endsAt ? endsAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null;
  return NextResponse.json({
    ok: true, status: 'cancel_scheduled', endsAt: endsAt ? endsAt.toISOString() : null,
    message: until
      ? `Assinatura cancelada. O acesso continua até ${until} e não haverá novas cobranças.`
      : 'Assinatura cancelada. Não haverá novas cobranças.',
  });
});
