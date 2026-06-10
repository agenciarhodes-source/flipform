import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getSubscription } from '@/lib/asaas';

export const GET = withPlatformAdmin(async () => {
  const subs = await prisma.subscription.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      tenant: { select: { id: true, name: true, status: true } },
      payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, updatedAt: true } },
    },
  });

  type SubRow = typeof subs[number];
  const tenantIds = Array.from(new Set((subs as SubRow[]).map((s) => s.tenantId)));
  const webhookEvents = tenantIds.length
    ? await prisma.webhookEvent.findMany({
        where: { tenantId: { in: tenantIds }, provider: 'asaas' },
        orderBy: { processedAt: 'desc' },
        select: { tenantId: true, eventType: true, processedAt: true },
      })
    : [];

  const lastWebhookByTenant = new Map<string, {
    eventType: string;
    processedAt: Date | null;
  }>();
  for (const evt of webhookEvents) {
    if (!evt.tenantId) continue;
    if (!lastWebhookByTenant.has(evt.tenantId)) {
      lastWebhookByTenant.set(evt.tenantId, { eventType: evt.eventType, processedAt: evt.processedAt });
    }
  }

  const reconciliationLogs = tenantIds.length
    ? await prisma.auditLog.findMany({
        where: { tenantId: { in: tenantIds }, action: { startsWith: 'billing.reconciliation.' } },
        orderBy: { createdAt: 'desc' },
        select: { tenantId: true, createdAt: true },
      })
    : [];

  const lastReconciledByTenant = new Map<string, Date>();
  for (const log of reconciliationLogs) {
    if (!lastReconciledByTenant.has(log.tenantId)) lastReconciledByTenant.set(log.tenantId, log.createdAt);
  }

  const rows = await Promise.all((subs as SubRow[]).map(async (s) => {
    let providerSubscriptionStatus: string | null = null;
    if (s.providerSubscriptionId && s.status !== 'trialing') {
      try {
        const providerSubscription = await getSubscription(s.providerSubscriptionId);
        providerSubscriptionStatus = providerSubscription?.status ? String(providerSubscription.status) : null;
      } catch {
        providerSubscriptionStatus = 'provider_error';
      }
    }

    const providerNorm = String(providerSubscriptionStatus || '').toLowerCase();
    const localNorm = String(s.status || '').toLowerCase();
    const statusDivergence = Boolean(providerSubscriptionStatus && providerNorm !== localNorm && providerNorm !== 'provider_error');

    return ({
      tenantName: s.tenant.name,
      tenantId: s.tenant.id,
      tenantStatus: s.tenant.status,
      subscriptionStatus: s.status,
      courtesy: s.status === 'courtesy',
      asaasCustomerId: s.providerCustomerId,
      asaasSubscriptionId: s.providerSubscriptionId,
      nextDueDate: s.nextDueDate,
      lastPaymentStatus: s.payments[0]?.status || null,
      lastWebhookEvent: lastWebhookByTenant.get(s.tenantId)?.eventType || null,
      lastWebhookAt: lastWebhookByTenant.get(s.tenantId)?.processedAt || null,
      updatedAt: s.updatedAt,
      providerSubscriptionStatus,
      statusDivergence,
      lastReconciledAt: lastReconciledByTenant.get(s.tenantId) || null,
    });
  }));

  return NextResponse.json({ rows });
});
