import { prisma } from '@/lib/prisma';
import { getSubscription, mapAsaasPaymentStatus } from '@/lib/asaas';
import { evaluateBillingAccess } from '@/lib/billing-access';
import { logPlatformAudit } from '@/lib/platform-audit';

export type ReconcileResult = {
  success: boolean;
  changed: boolean;
  reason?: string;
  before?: any;
  after?: any;
};

function mapProviderSubscriptionStatus(status: string): 'active' | 'past_due' | 'canceled' | 'suspended' | 'trialing' | null {
  const s = String(status || '').toUpperCase();
  if (!s) return null;
  if (s.includes('ACTIVE')) return 'active';
  if (s.includes('OVERDUE') || s.includes('PENDING')) return 'past_due';
  if (s.includes('CANCEL')) return 'canceled';
  if (s.includes('TRIAL')) return 'trialing';
  return null;
}

export async function reconcileSubscription(subscriptionId: string): Promise<ReconcileResult> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { tenant: { select: { id: true, status: true } }, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!subscription) return { success: false, changed: false, reason: 'subscription_not_found' };
  if (subscription.status === 'trialing') return { success: true, changed: false, reason: 'trialing_ignored' };
  if (!subscription.providerSubscriptionId) return { success: true, changed: false, reason: 'missing_provider_subscription_id' };

  const before = { subscriptionStatus: subscription.status, tenantStatus: subscription.tenant.status, lastPaymentStatus: subscription.payments[0]?.status || null };
  await logPlatformAudit({ tenantId: subscription.tenantId, entityType: 'billing', entityId: subscription.id, action: 'billing.reconciliation.started' });

  try {
    const providerSubscription = await getSubscription(subscription.providerSubscriptionId);
    const providerSubStatus = mapProviderSubscriptionStatus(providerSubscription?.status);
    const providerPaymentStatus = mapAsaasPaymentStatus(providerSubscription?.status || '');

    let nextSubscriptionStatus = subscription.status;
    if (providerSubStatus && subscription.status !== 'canceled') {
      if (providerSubStatus === 'active' && providerPaymentStatus === 'received') nextSubscriptionStatus = 'active';
      else if (providerSubStatus === 'past_due') nextSubscriptionStatus = 'past_due';
      else if (providerSubStatus === 'canceled') nextSubscriptionStatus = 'canceled';
    }

    const access = evaluateBillingAccess({ tenantStatus: subscription.tenant.status, subscriptionStatus: nextSubscriptionStatus });
    let nextTenantStatus = subscription.tenant.status;
    if (subscription.tenant.status !== 'canceled') {
      if (nextSubscriptionStatus === 'canceled') nextTenantStatus = 'canceled';
      else if (access.shouldSuspend) nextTenantStatus = 'suspended';
      else if (access.allowAccess && (nextTenantStatus === 'suspended' || nextTenantStatus === 'past_due')) nextTenantStatus = 'active';
    }

    const changed = nextSubscriptionStatus !== subscription.status || nextTenantStatus !== subscription.tenant.status;
    if (changed) {
      await prisma.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
        if (nextSubscriptionStatus !== subscription.status) {
          await tx.subscription.update({ where: { id: subscription.id }, data: { status: nextSubscriptionStatus as any, gracePeriodEndsAt: nextSubscriptionStatus === 'active' ? null : subscription.gracePeriodEndsAt } });
        }
        if (nextTenantStatus !== subscription.tenant.status && subscription.tenant.status !== 'canceled') {
          await tx.tenant.updateMany({ where: { id: subscription.tenantId, status: { not: 'canceled' } }, data: { status: nextTenantStatus as any } });
        }
        if (nextTenantStatus === 'active' && (subscription.tenant.status === 'suspended' || subscription.tenant.status === 'past_due')) {
          await tx.allowedUser.updateMany({ where: { tenantId: subscription.tenantId }, data: { active: true, status: 'active' } });
        }
      });
      await logPlatformAudit({ tenantId: subscription.tenantId, entityType: 'billing', entityId: subscription.id, action: 'billing.reconciliation.changed', metadata: { before, after: { subscriptionStatus: nextSubscriptionStatus, tenantStatus: nextTenantStatus }, providerStatus: providerSubscription?.status } });
      if (nextTenantStatus === 'active' && subscription.tenant.status !== 'active') {
        await logPlatformAudit({ tenantId: subscription.tenantId, entityType: 'billing', entityId: subscription.id, action: 'billing.reconciliation.reactivated' });
      }
    } else {
      await logPlatformAudit({ tenantId: subscription.tenantId, entityType: 'billing', entityId: subscription.id, action: 'billing.reconciliation.no_change', metadata: { providerStatus: providerSubscription?.status } });
    }

    return { success: true, changed, before, after: { subscriptionStatus: nextSubscriptionStatus, tenantStatus: nextTenantStatus, providerStatus: providerSubscription?.status } };
  } catch (error: any) {
    await logPlatformAudit({ tenantId: subscription.tenantId, entityType: 'billing', entityId: subscription.id, action: 'billing.reconciliation.failed', metadata: { error: error?.message || 'unknown_error' } });
    return { success: false, changed: false, reason: 'provider_error', before };
  }
}

export async function reconcileTenantBilling(tenantId: string): Promise<ReconcileResult> {
  const sub = await prisma.subscription.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  if (!sub) return { success: false, changed: false, reason: 'subscription_not_found' };
  return reconcileSubscription(sub.id);
}

export async function reconcileProviderSubscription(providerSubscriptionId: string): Promise<ReconcileResult> {
  const sub = await prisma.subscription.findFirst({ where: { providerSubscriptionId }, select: { id: true } });
  if (!sub) return { success: false, changed: false, reason: 'subscription_not_found' };
  return reconcileSubscription(sub.id);
}
