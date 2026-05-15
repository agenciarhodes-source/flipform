import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { cancelSubscription, createCustomer, createSubscription, getSubscription } from '@/lib/asaas';
import { logPlatformAudit } from '@/lib/platform-audit';

export const POST = withPlatformAdmin(async (req, session, ctx: { params: { id: string } }) => {
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
      if (!sub.providerSubscriptionId) return NextResponse.json({ error: 'Subscription Asaas ausente' }, { status: 400 });
      const remote = await getSubscription(sub.providerSubscriptionId);
      await prisma.subscription.update({ where: { id: sub.id }, data: {
        status: String(remote.status || sub.status).toLowerCase() as any,
        nextDueDate: remote.nextDueDate ? new Date(remote.nextDueDate) : sub.nextDueDate,
        currentPeriodStart: remote.dateCreated ? new Date(remote.dateCreated) : sub.currentPeriodStart,
        currentPeriodEnd: remote.nextDueDate ? new Date(remote.nextDueDate) : sub.currentPeriodEnd,
      } });
      return NextResponse.json({ ok: true, remoteStatus: remote.status });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Falha ao comunicar com Asaas' }, { status: 502 });
  }
});
