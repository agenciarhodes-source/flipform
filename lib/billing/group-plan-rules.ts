/**
 * Group plan (Plano Grupo): one store of a business group pays for all of them; the other stores
 * get the same plan (Premium, AI included) and follow the paying store's subscription. Price:
 * the first store at the base price, each additional store at the additional price.
 * Pure rules, easy to test.
 */
import { tenantStatusFor, type OurSubscriptionStatus, type OurTenantStatus } from './subscription-rules';

export const GROUP_PLAN_BASE_PRICE = 997;
export const GROUP_PLAN_ADDITIONAL_STORE_PRICE = 297;
/** Provider of the subscription a covered store receives (never charged on its own). */
export const GROUP_PLAN_PROVIDER = 'business_group';

export type MemberSubscriptionStatus = OurSubscriptionStatus | 'courtesy';

function cents(value: number) {
  return Math.round(Number(value) * 100);
}

/** Monthly total in cents: the first store at the base price, the others at the additional price. */
export function groupPlanTotalCents(storeCount: number, basePrice: number, additionalStorePrice: number) {
  const stores = Math.max(1, Math.floor(Number(storeCount) || 0));
  return cents(basePrice) + (stores - 1) * cents(additionalStorePrice);
}

/** "R$ 1.591,00" */
export function formatBrlCents(value: number) {
  return (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Valid prices for a group plan: a base above zero, an additional price of zero or more. */
export function validGroupPlanPrices(basePrice: number, additionalStorePrice: number) {
  return Number.isFinite(basePrice) && Number.isFinite(additionalStorePrice)
    && basePrice > 0 && basePrice <= 100000 && additionalStorePrice >= 0 && additionalStorePrice <= 100000;
}

/**
 * The status the covered stores get, from the paying store's subscription (or, without one, from
 * the paying store's own status). A late or canceled payer takes the whole group with it.
 */
export function memberSubscriptionStatus(
  payerSubscription: { status: string } | null,
  payerTenantStatus: string,
): MemberSubscriptionStatus {
  if (payerSubscription) {
    switch (payerSubscription.status) {
      case 'courtesy': return 'courtesy';
      case 'trialing': return 'trialing';
      case 'active': return 'active';
      case 'past_due': return 'past_due';
      case 'canceled': return 'canceled';
      case 'paused': return 'paused';
      default: return 'suspended';
    }
  }
  switch (payerTenantStatus) {
    case 'active': return 'active';
    case 'trial': return 'trialing';
    case 'past_due': return 'past_due';
    case 'canceled': return 'canceled';
    default: return 'suspended';
  }
}

/** The company status of a covered store for its subscription status. */
export function memberTenantStatus(status: MemberSubscriptionStatus): OurTenantStatus {
  return status === 'courtesy' ? 'active' : tenantStatusFor(status);
}

/**
 * A store that pays its own subscription (Stripe, Asaas) is never covered by the group until that
 * subscription is canceled: no store is ever charged twice.
 */
export function hasOwnPaidSubscription(subscriptions: Array<{ provider: string | null; status: string; paymentRequired: boolean }>) {
  return subscriptions.some((subscription) =>
    subscription.paymentRequired
    && !['business_group', 'courtesy'].includes(String(subscription.provider || '').toLowerCase())
    && ['trialing', 'active', 'past_due'].includes(subscription.status));
}
