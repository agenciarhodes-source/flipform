import 'server-only';

import { setStripeSubscriptionAmount } from '@/lib/stripe/subscription-manage';
import { loadGroupPlan, payerBilling, payerPlanAloneCents, syncGroupPlan, type GroupPlanSyncResult } from './group-plan';

export type GroupPlanBilling = 'stripe_updated' | 'stripe_same' | 'stripe_error' | 'courtesy' | 'not_stripe' | 'none';

/**
 * Applies the group plan: the stores follow the paying store, and the paying store's Stripe
 * subscription is charged the group total (or its plan alone again when the group plan ends).
 * A store that does not pay through Stripe is charged by hand (shown to the platform).
 */
export async function refreshGroupPlan(groupId: string): Promise<{ sync: GroupPlanSyncResult; billing: GroupPlanBilling; billingError?: string }> {
  const sync = await syncGroupPlan(groupId);
  const { plan } = await loadGroupPlan(groupId);
  if (!plan) return { sync, billing: 'none' };
  const payer = await payerBilling(plan.payerTenantId);
  const provider = String(payer.subscription?.provider || '').toLowerCase();
  if (payer.subscription?.status === 'courtesy' || provider === 'courtesy') return { sync, billing: 'courtesy' };
  if (provider !== 'stripe' || !payer.plan) return { sync, billing: 'not_stripe' };
  const amount = plan.status === 'active' && sync.status === 'synced' ? sync.totalCents : payerPlanAloneCents(payer.plan);
  if (amount <= 0) return { sync, billing: 'none' };
  try {
    const result = await setStripeSubscriptionAmount(plan.payerTenantId, payer.plan, amount);
    if (result.reason === 'no_stripe_subscription') return { sync, billing: 'not_stripe' };
    return { sync, billing: result.changed ? 'stripe_updated' : 'stripe_same' };
  } catch (error) {
    console.error('[group-plan][stripe-amount]', { groupId, errorType: error instanceof Error ? error.name : 'unknown' });
    return { sync, billing: 'stripe_error', billingError: error instanceof Error ? error.message : 'Falha no Stripe.' };
  }
}
