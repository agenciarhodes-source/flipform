import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const GET = withPlatformAdmin(async () => {
  const subs = await prisma.subscription.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      tenant: { select: { id: true, name: true, status: true } },
      payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, updatedAt: true } },
    },
  });

  const tenantIds = Array.from(new Set(subs.map((s) => s.tenantId)));
  const webhookEvents = tenantIds.length
    ? await prisma.webhookEvent.findMany({
        where: { tenantId: { in: tenantIds }, provider: 'asaas' },
        orderBy: { processedAt: 'desc' },
        select: { tenantId: true, eventType: true, processedAt: true },
      })
    : [];

  const lastWebhookByTenant = new Map<string, { eventType: string; processedAt: Date | null }>();
  for (const evt of webhookEvents) {
    if (!evt.tenantId) continue;
    if (!lastWebhookByTenant.has(evt.tenantId)) {
      lastWebhookByTenant.set(evt.tenantId, { eventType: evt.eventType, processedAt: evt.processedAt });
    }
  }

  return NextResponse.json({
    rows: subs.map((s) => ({
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
    })),
  });
});
