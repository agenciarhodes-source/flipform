import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { mapPaymentStatus, validateWebhookToken } from '@/lib/asaas';
import { logAudit } from '@/lib/audit';

export async function POST(req: Request) {
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
      await prisma.subscription.updateMany({ where: { id: tenant.subscriptionId || '' }, data: { status: 'active', gracePeriodEndsAt: null } });
      await prisma.tenant.update({ where: { id: tenant.tenantId }, data: { status: 'active' } });
      await prisma.allowedUser.updateMany({ where: { tenantId: tenant.tenantId }, data: { active: true, status: 'active', acceptedAt: new Date() } });
    }

    await logAudit({ tenantId: tenant.tenantId, entityType: 'billing', entityId: providerPaymentId, action: `billing.webhook.${event.toLowerCase()}`, metadata: { event, paymentStatus } });
  }

  return NextResponse.json({ ok: true });
}
