import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logPlatformAudit } from '@/lib/platform-audit';
import { planIncludesAi, planPriceCents } from './subscription-rules';
import {
  GROUP_PLAN_PROVIDER,
  groupPlanTotalCents,
  hasOwnPaidSubscription,
  memberSubscriptionStatus,
  memberTenantStatus,
} from './group-plan-rules';

export type GroupPlan = {
  groupId: string;
  payerTenantId: string;
  basePrice: number;
  additionalStorePrice: number;
  status: 'active' | 'ended';
};

export type GroupPlanSyncResult = {
  status: 'no_plan' | 'synced' | 'ended' | 'payer_outside_group' | 'payer_not_premium';
  storeCount: number;
  totalCents: number;
  covered: string[];
  skipped: Array<{ tenantId: string; reason: 'own_subscription' | 'closed' }>;
  canceled: string[];
};

function tableMissing(error: unknown) {
  const code = String((error as { code?: string })?.code || '');
  const metaCode = String((error as { meta?: { code?: string } })?.meta?.code || '');
  const message = error instanceof Error ? error.message : String(error);
  return code === 'P2021' || metaCode === '42P01' || /relation "?business_group_plans"? does not exist/i.test(message);
}

/** The group's plan, or null; schemaReady is false while the table is not installed. */
export async function loadGroupPlan(groupId: string): Promise<{ schemaReady: boolean; plan: GroupPlan | null }> {
  try {
    const rows = await prisma.$queryRaw<Array<{ groupId: string; payerTenantId: string; basePrice: unknown; additionalStorePrice: unknown; status: string }>>(Prisma.sql`
      SELECT group_id AS "groupId", payer_tenant_id AS "payerTenantId", base_price AS "basePrice",
        additional_store_price AS "additionalStorePrice", status
      FROM business_group_plans WHERE group_id = ${groupId} LIMIT 1
    `);
    const row = rows[0];
    if (!row) return { schemaReady: true, plan: null };
    return {
      schemaReady: true,
      plan: {
        groupId: row.groupId,
        payerTenantId: row.payerTenantId,
        basePrice: Number(row.basePrice),
        additionalStorePrice: Number(row.additionalStorePrice),
        status: row.status === 'ended' ? 'ended' : 'active',
      },
    };
  } catch (error) {
    if (tableMissing(error)) return { schemaReady: false, plan: null };
    throw error;
  }
}

export async function groupTenantIds(groupId: string) {
  const rows = await prisma.$queryRaw<Array<{ tenantId: string }>>(Prisma.sql`
    SELECT tenant_id AS "tenantId" FROM business_group_tenants WHERE group_id = ${groupId} ORDER BY created_at ASC
  `);
  return rows.map((row) => row.tenantId);
}

/** The plan and subscription the paying store has now (its own, never a group one). */
export async function payerBilling(tenantId: string) {
  const [tenant, subscription] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, status: true, plan: { select: { id: true, slug: true, name: true, price: true, billingCycle: true } } } }),
    prisma.subscription.findFirst({
      where: { tenantId, NOT: { provider: GROUP_PLAN_PROVIDER } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true, status: true, provider: true, gracePeriodEndsAt: true, nextDueDate: true,
        currentPeriodStart: true, currentPeriodEnd: true,
        plan: { select: { id: true, slug: true, name: true, price: true, billingCycle: true } },
      },
    }),
  ]);
  const plan = subscription?.plan || tenant?.plan || null;
  return { tenant, subscription, plan, premium: Boolean(plan && planIncludesAi(plan.slug)) };
}

async function cancelGroupRows(groupId: string, keepTenantIds: string[] = []) {
  const rows = await prisma.subscription.findMany({
    where: { provider: GROUP_PLAN_PROVIDER, providerSubscriptionId: groupId, status: { not: 'canceled' }, tenantId: { notIn: keepTenantIds } },
    select: { id: true, tenantId: true },
  });
  for (const row of rows) {
    await prisma.subscription.update({ where: { id: row.id }, data: { status: 'canceled', canceledAt: new Date(), gracePeriodEndsAt: null } });
  }
  return rows.map((row) => row.tenantId);
}

/**
 * Brings every store of the group in line with the paying store: same plan, a subscription that
 * mirrors the payer's status (paid, late with the same grace period, canceled). Stores that pay
 * their own subscription are left as they are and reported. Stores that left the group, or a plan
 * that ended, lose the group subscription (the AI stops; the company, its team and data stay).
 */
export async function syncGroupPlan(groupId: string): Promise<GroupPlanSyncResult> {
  const { plan } = await loadGroupPlan(groupId);
  const empty = { storeCount: 0, totalCents: 0, covered: [], skipped: [] };
  if (!plan) return { status: 'no_plan', ...empty, canceled: [] };
  const tenantIds = await groupTenantIds(groupId);
  const storeCount = tenantIds.length;
  const totalCents = groupPlanTotalCents(storeCount, plan.basePrice, plan.additionalStorePrice);

  if (plan.status === 'ended') return { status: 'ended', ...empty, canceled: await cancelGroupRows(groupId) };
  if (!tenantIds.includes(plan.payerTenantId)) {
    return { status: 'payer_outside_group', ...empty, storeCount, totalCents, canceled: await cancelGroupRows(groupId) };
  }
  const payer = await payerBilling(plan.payerTenantId);
  if (!payer.tenant || !payer.plan || !payer.premium) {
    return { status: 'payer_not_premium', ...empty, storeCount, totalCents, canceled: await cancelGroupRows(groupId) };
  }

  const status = memberSubscriptionStatus(payer.subscription, payer.tenant.status);
  const tenantStatus = memberTenantStatus(status);
  const covered: string[] = [];
  const skipped: GroupPlanSyncResult['skipped'] = [];
  for (const tenantId of tenantIds) {
    if (tenantId === plan.payerTenantId) continue;
    const [tenant, subscriptions] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true } }),
      prisma.subscription.findMany({
        where: { tenantId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, provider: true, providerSubscriptionId: true, status: true, paymentRequired: true },
      }),
    ]);
    if (!tenant || tenant.status === 'blocked') {
      skipped.push({ tenantId, reason: 'closed' });
      continue;
    }
    if (hasOwnPaidSubscription(subscriptions)) {
      skipped.push({ tenantId, reason: 'own_subscription' });
      continue;
    }
    const data = {
      planId: payer.plan.id,
      status,
      gracePeriodEndsAt: status === 'past_due' ? payer.subscription?.gracePeriodEndsAt ?? null : null,
      nextDueDate: payer.subscription?.nextDueDate ?? null,
      currentPeriodStart: payer.subscription?.currentPeriodStart ?? null,
      currentPeriodEnd: payer.subscription?.currentPeriodEnd ?? null,
      canceledAt: status === 'canceled' ? new Date() : null,
    };
    const latest = subscriptions[0];
    const ours = latest && latest.provider === GROUP_PLAN_PROVIDER && latest.providerSubscriptionId === groupId ? latest : null;
    if (ours) {
      await prisma.subscription.update({ where: { id: ours.id }, data });
    } else {
      // The newest subscription is the one every access check reads: the group one goes on top.
      await prisma.subscription.create({
        data: { ...data, tenantId, provider: GROUP_PLAN_PROVIDER, paymentProvider: null, paymentRequired: false, providerSubscriptionId: groupId },
      });
    }
    await prisma.tenant.update({ where: { id: tenantId }, data: { planId: payer.plan.id, nextDueDate: data.nextDueDate } });
    // A store closed by hand (canceled) is reopened only by the platform, never here.
    await prisma.tenant.updateMany({
      where: { id: tenantId, status: { notIn: ['canceled', 'blocked'] } },
      data: { status: tenantStatus },
    });
    covered.push(tenantId);
  }
  const canceled = await cancelGroupRows(groupId, covered);
  return { status: 'synced', storeCount, totalCents, covered, skipped, canceled };
}

/** After a payment event of a store: every active group it pays for follows it. */
export async function syncGroupPlansForPayer(tenantId: string) {
  let rows: Array<{ groupId: string }> = [];
  try {
    rows = await prisma.$queryRaw<Array<{ groupId: string }>>(Prisma.sql`
      SELECT group_id AS "groupId" FROM business_group_plans WHERE payer_tenant_id = ${tenantId} AND status = 'active'
    `);
  } catch (error) {
    if (tableMissing(error)) return [];
    throw error;
  }
  const results = [];
  for (const row of rows) {
    const result = await syncGroupPlan(row.groupId);
    results.push({ groupId: row.groupId, status: result.status });
    await logPlatformAudit({
      tenantId, userId: null, entityType: 'business_group', entityId: row.groupId,
      action: 'business_group.plan_synced', metadata: { trigger: 'payer_billing', ...result },
    }).catch(() => undefined);
  }
  return results;
}

/** The amount the paying store's plan costs alone (to return to it when the group plan ends). */
export function payerPlanAloneCents(plan: { price: unknown } | null) {
  return plan ? planPriceCents(plan.price) : 0;
}

/** Whether the company pays an active group plan (its plan is changed by the platform only). */
export async function isActiveGroupPayer(tenantId: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{ one: number }>>(Prisma.sql`
      SELECT 1 AS one FROM business_group_plans WHERE payer_tenant_id = ${tenantId} AND status = 'active' LIMIT 1
    `);
    return rows.length > 0;
  } catch (error) {
    if (tableMissing(error)) return false;
    throw error;
  }
}
