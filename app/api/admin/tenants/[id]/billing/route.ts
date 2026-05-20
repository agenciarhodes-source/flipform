import { NextResponse } from 'next/server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { withPlatformAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { cancelSubscription, createCustomer, createSubscription, getPayment, getSubscription, mapAsaasPaymentStatus } from '@/lib/asaas';
import { logPlatformAudit } from '@/lib/platform-audit';
import { evaluateBillingAccess } from '@/lib/billing-access';

function mapAsaasSubscriptionStatus(status: string, fallback: string) {
  const s = String(status || '').toUpperCase();
  if (s.includes('ACTIVE')) return 'active';
  if (s.includes('OVERDUE')) return 'past_due';
  if (s.includes('CANCEL')) return 'canceled';
  if (s.includes('SUSPEND')) return 'suspended';
  return fallback;
}

export const POST = withPlatformAdmin(async (req, session, ctx: { params: { id: string } }) => {
  const rl = rateLimit({ key: `admin:tenant-billing:user:${session.userId}`, limit: 60, windowMs: 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  const tenantId = ctx.params.id;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 });

  try {
    if (action === 'create_customer') {
      const customer = await createCustomer({ name: tenant.name, email: body.email || undefined, externalReference: tenant.id });
      const latest = await prisma.subscription.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
      if (latest) {
        await prisma.subscription.update({ where: { id: latest.id }, data: { provider: 'asaas', providerCustomerId: customer.id } });
      } else if (body.planId) {
        await prisma.subscription.create({ data: { tenantId, planId: body.planId, provider: 'asaas', providerCustomerId: customer.id, status: 'trialing' } });
      }
      await logPlatformAudit({ tenantId, userId: session.userId, entityType: 'billing', entityId: tenantId, action: 'billing.asaas_customer_created', metadata: { customerId: customer.id } });
      return NextResponse.json({ ok: true, customerId: customer.id });
    }

    const sub = await prisma.subscription.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    if (!sub) return NextResponse.json({ error: 'Subscription não encontrada' }, { status: 404 });

    if (action === 'create_subscription') {
      const created = await createSubscription({ customer: sub.providerCustomerId, billingType: body.billingType || 'UNDEFINED', value: body.value, nextDueDate: body.nextDueDate, cycle: body.cycle || 'MONTHLY', externalReference: tenantId });
      await prisma.subscription.update({ where: { id: sub.id }, data: { provider: 'asaas', providerSubscriptionId: created.id, status: 'active', nextDueDate: created.nextDueDate ? new Date(created.nextDueDate) : null } });
      await logPlatformAudit({ tenantId, userId: session.userId, entityType: 'billing', entityId: sub.id, action: 'billing.asaas_subscription_created', metadata: { providerSubscriptionId: created.id } });
      return NextResponse.json({ ok: true, subscriptionId: created.id });
    }

    if (action === 'cancel_subscription') {
      if (!sub.providerSubscriptionId) return NextResponse.json({ error: 'Subscription Asaas ausente' }, { status: 400 });
      await cancelSubscription(sub.providerSubscriptionId);
      await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'canceled', canceledAt: new Date() } });
      await logPlatformAudit({ tenantId, userId: session.userId, entityType: 'billing', entityId: sub.id, action: 'billing.asaas_subscription_cancelled' });
      return NextResponse.json({ ok: true });
    }

    if (action === 'sync_subscription') {
      if (!sub.providerSubscriptionId) {
        return NextResponse.json({ error: 'Não foi possível sincronizar: assinatura Asaas não encontrada para este tenant.' }, { status: 400 });
      }

      const remoteSub = await getSubscription(sub.providerSubscriptionId);
      const nextSubStatus = mapAsaasSubscriptionStatus(remoteSub?.status, sub.status);

      let nextPaymentStatus: string | null = null;
      const latestLocalPayment = await prisma.payment.findFirst({
        where: { tenantId, subscriptionId: sub.id, providerPaymentId: { not: null } },
        orderBy: { createdAt: 'desc' },
      });

      if (latestLocalPayment?.providerPaymentId) {
        const remotePayment = await getPayment(latestLocalPayment.providerPaymentId);
        nextPaymentStatus = mapAsaasPaymentStatus(String(remotePayment?.status || ''));
        await prisma.payment.updateMany({
          where: { id: latestLocalPayment.id },
          data: {
            status: nextPaymentStatus as any,
            dueDate: remotePayment?.dueDate ? new Date(remotePayment.dueDate) : latestLocalPayment.dueDate,
            paidAt: remotePayment?.paymentDate ? new Date(remotePayment.paymentDate) : (remotePayment?.paidDate ? new Date(remotePayment.paidDate) : latestLocalPayment.paidAt),
            invoiceUrl: remotePayment?.invoiceUrl || latestLocalPayment.invoiceUrl,
            bankSlipUrl: remotePayment?.bankSlipUrl || latestLocalPayment.bankSlipUrl,
            pixQrCode: remotePayment?.pixQrCode || latestLocalPayment.pixQrCode,
            rawPayload: remotePayment || latestLocalPayment.rawPayload,
          },
        });
      }

      await prisma.subscription.updateMany({
        where: { id: sub.id },
        data: {
          status: nextSubStatus as any,
          nextDueDate: remoteSub?.nextDueDate ? new Date(remoteSub.nextDueDate) : sub.nextDueDate,
          currentPeriodStart: remoteSub?.dateCreated ? new Date(remoteSub.dateCreated) : sub.currentPeriodStart,
          currentPeriodEnd: remoteSub?.nextDueDate ? new Date(remoteSub.nextDueDate) : sub.currentPeriodEnd,
          gracePeriodEndsAt: nextSubStatus === 'past_due' ? (sub.gracePeriodEndsAt || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)) : null,
        },
      });

      const refreshedTenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true } });
      const access = evaluateBillingAccess({ tenantStatus: refreshedTenant?.status, subscriptionStatus: nextSubStatus });

      if (nextSubStatus === 'canceled' || refreshedTenant?.status === 'canceled') {
        await prisma.tenant.updateMany({ where: { id: tenantId }, data: { status: 'canceled' } });
      } else if (nextPaymentStatus === 'received' || nextPaymentStatus === 'confirmed') {
        await prisma.tenant.updateMany({ where: { id: tenantId, status: { not: 'canceled' } }, data: { status: 'active' } });
        await prisma.allowedUser.updateMany({ where: { tenantId }, data: { active: true, status: 'active', acceptedAt: new Date() } });
      } else if (!access.allowAccess && access.shouldSuspend) {
        await prisma.tenant.updateMany({ where: { id: tenantId, status: { not: 'canceled' } }, data: { status: 'suspended' } });
      } else if (nextSubStatus === 'past_due') {
        await prisma.tenant.updateMany({ where: { id: tenantId, status: { not: 'canceled' } }, data: { status: 'past_due' } });
      }

      await logPlatformAudit({
        tenantId,
        userId: session.userId,
        entityType: 'billing',
        entityId: sub.id,
        action: 'billing.asaas_subscription_synced',
        metadata: {
          providerSubscriptionId: sub.providerSubscriptionId,
          remoteSubscriptionStatus: remoteSub?.status || null,
          localSubscriptionStatus: nextSubStatus,
          localPaymentStatus: nextPaymentStatus,
        },
      });

      return NextResponse.json({ ok: true, remoteStatus: remoteSub?.status || null, paymentStatus: nextPaymentStatus });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (err) {
    console.error('billing tenant action error', err);
    return NextResponse.json({ error: 'Falha ao comunicar com Asaas' }, { status: 502 });
  }
});
