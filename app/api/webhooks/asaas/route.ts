import { NextResponse } from 'next/server';
import { captureServerException } from '@/lib/observability';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { mapPaymentStatus, validateWebhookToken } from '@/lib/asaas';
import { evaluateBillingAccess } from '@/lib/billing-access';
import { logAudit } from '@/lib/audit';
import { createFirstAccessToken } from '@/lib/first-access';
import { sendTransactionalEmail } from '@/lib/email/send';
import { getAppLoginUrl } from '@/lib/public-urls';

export async function POST(req: Request) {
  try {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `webhook:asaas:ip:${ip}`, limit: 120, windowMs: 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  if (!validateWebhookToken(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const payload = await req.json().catch(() => ({}));
  const event = String(payload.event || payload.type || 'UNKNOWN');
  const eventId = String(payload.id || payload.eventId || `${event}-${Date.now()}`);
  const payment = payload.payment || {};
  const providerPaymentId = payment.id ? String(payment.id) : null;

  const exists = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider: 'asaas', eventId } } });
  if (exists) return NextResponse.json({ ok: true, duplicate: true });

  const tenant = providerPaymentId
    ? await prisma.payment.findFirst({ where: { providerPaymentId }, select: { tenantId: true, subscriptionId: true } })
    : null;

  await prisma.webhookEvent.create({
    data: { provider: 'asaas', eventId, eventType: event, providerPaymentId, rawPayload: payload, processedAt: new Date(), tenantId: tenant?.tenantId || null },
  });

  if (tenant?.tenantId && providerPaymentId) {
    const paymentStatus = mapPaymentStatus(payment.status || event);
    await prisma.payment.updateMany({ where: { providerPaymentId }, data: {
      status: paymentStatus as any,
      paidAt: payment.paidDate ? new Date(payment.paidDate) : undefined,
      dueDate: payment.dueDate ? new Date(payment.dueDate) : undefined,
      invoiceUrl: payment.invoiceUrl || undefined,
      bankSlipUrl: payment.bankSlipUrl || undefined,
      pixQrCode: payment.pixQrCode || undefined,
      rawPayload: payload,
    } });

    if (paymentStatus === 'overdue') {
      const gracePeriodEndsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      await prisma.subscription.updateMany({ where: { id: tenant.subscriptionId || '' }, data: { status: 'past_due', gracePeriodEndsAt } });
      await prisma.tenant.update({ where: { id: tenant.tenantId }, data: { status: 'past_due' } });
    }

    if (paymentStatus === 'received') {
      const currentSubscription = await prisma.subscription.findUnique({ where: { id: tenant.subscriptionId || '' }, select: { status: true, plan: { select: { name: true } } } });
      const currentTenant = await prisma.tenant.findUnique({ where: { id: tenant.tenantId }, select: { status: true, name: true } });
      const access = evaluateBillingAccess({ tenantStatus: currentTenant?.status, subscriptionStatus: currentSubscription?.status });

      if (currentSubscription?.status !== 'canceled') {
        await prisma.subscription.updateMany({ where: { id: tenant.subscriptionId || '', status: { not: 'canceled' } }, data: { status: 'active', gracePeriodEndsAt: null } });
      }

      if (currentTenant?.status !== 'canceled' && (!access.allowAccess || currentTenant?.status === 'past_due')) {
        await prisma.tenant.updateMany({ where: { id: tenant.tenantId, status: { not: 'canceled' } }, data: { status: 'active' } });
        await prisma.allowedUser.updateMany({ where: { tenantId: tenant.tenantId }, data: { active: true, status: 'active', acceptedAt: new Date() } });
      }

      const ownerAllowed = await prisma.allowedUser.findFirst({ where: { tenantId: tenant.tenantId, active: true }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] });
      if (ownerAllowed?.email) {
        try {
          const firstAccess = await createFirstAccessToken({ email: ownerAllowed.email, tenantId: tenant.tenantId, userId: null });
          const emailResult = await sendTransactionalEmail({
            to: ownerAllowed.email,
            tenantId: tenant.tenantId,
            userId: null,
            template: 'plan_activated',
            params: {
              planName: currentSubscription?.plan?.name || 'Plano FlipForm',
              email: ownerAllowed.email,
              firstAccessUrl: firstAccess.url,
              appLoginUrl: getAppLoginUrl(),
            },
          });

          await logAudit({ tenantId: tenant.tenantId, entityType: 'first_access', entityId: ownerAllowed.email, action: emailResult.ok ? 'first_access.email_queued' : 'first_access.email_skipped', metadata: { skipped: !emailResult.ok, reason: (emailResult as any).reason || null } });
        } catch (emailError) {
          console.error('[first-access.email]', { message: emailError instanceof Error ? emailError.message : String(emailError) });
          await logAudit({ tenantId: tenant.tenantId, entityType: 'first_access', entityId: ownerAllowed.email, action: 'first_access.email_skipped', metadata: { reason: 'SEND_FAILED' } });
        }
      }
    }

    await logAudit({ tenantId: tenant.tenantId, entityType: 'billing', entityId: providerPaymentId, action: `billing.webhook.${event.toLowerCase()}`, metadata: { event, paymentStatus } });
  }

  return NextResponse.json({ ok: true });
  } catch (error) {
    captureServerException(error, { route: '/api/webhooks/asaas', method: 'POST' });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
