import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupPlanChargeCents,
  groupPlanTotalCents,
  hasOwnPaidSubscription,
  memberSubscriptionStatus,
  memberTenantStatus,
  validGroupPlanPrices,
  validNegotiatedPrice,
} from '../lib/billing/group-plan-rules';

test('group plan total: first store at the base price, each additional at the additional price', () => {
  assert.equal(groupPlanTotalCents(1, 997, 297), 99700);
  assert.equal(groupPlanTotalCents(3, 997, 297), 159100);
  assert.equal(groupPlanTotalCents(6, 997, 297), 248200);
  assert.equal(groupPlanTotalCents(0, 997, 297), 99700);
  assert.equal(groupPlanTotalCents(2, 997.5, 297.25), 129475);
});

test('the covered stores follow the paying store', () => {
  assert.equal(memberSubscriptionStatus({ status: 'active' }, 'active'), 'active');
  assert.equal(memberSubscriptionStatus({ status: 'courtesy' }, 'active'), 'courtesy');
  assert.equal(memberSubscriptionStatus({ status: 'past_due' }, 'past_due'), 'past_due');
  assert.equal(memberSubscriptionStatus({ status: 'canceled' }, 'canceled'), 'canceled');
  assert.equal(memberSubscriptionStatus({ status: 'unpaid' }, 'suspended'), 'suspended');
  assert.equal(memberSubscriptionStatus(null, 'active'), 'active');
  assert.equal(memberSubscriptionStatus(null, 'trial'), 'trialing');
  assert.equal(memberSubscriptionStatus(null, 'blocked'), 'suspended');
  assert.equal(memberTenantStatus('courtesy'), 'active');
  assert.equal(memberTenantStatus('past_due'), 'past_due');
  assert.equal(memberTenantStatus('canceled'), 'canceled');
});

test('a store paying its own subscription is never covered (no double charge)', () => {
  assert.equal(hasOwnPaidSubscription([{ provider: 'stripe', status: 'active', paymentRequired: true }]), true);
  assert.equal(hasOwnPaidSubscription([{ provider: 'asaas', status: 'past_due', paymentRequired: true }]), true);
  assert.equal(hasOwnPaidSubscription([{ provider: 'stripe', status: 'canceled', paymentRequired: true }]), false);
  assert.equal(hasOwnPaidSubscription([{ provider: 'courtesy', status: 'courtesy', paymentRequired: false }]), false);
  assert.equal(hasOwnPaidSubscription([{ provider: 'business_group', status: 'active', paymentRequired: false }]), false);
  assert.equal(hasOwnPaidSubscription([]), false);
});

test('a negotiated price replaces the table price', () => {
  const table = { storeCount: 3, basePrice: 997, additionalStorePrice: 297 };
  assert.equal(groupPlanChargeCents({ ...table, negotiatedPrice: null }), 159100);
  assert.equal(groupPlanChargeCents({ ...table, negotiatedPrice: 997 }), 99700);
  assert.equal(groupPlanChargeCents({ ...table, negotiatedPrice: 1297.5 }), 129750);
  assert.equal(groupPlanChargeCents({ ...table, negotiatedPrice: 0 }), 159100);
  assert.equal(validNegotiatedPrice(null), true);
  assert.equal(validNegotiatedPrice(997), true);
  assert.equal(validNegotiatedPrice(0), false);
  assert.equal(validNegotiatedPrice(-5), false);
});

test('valid prices', () => {
  assert.equal(validGroupPlanPrices(997, 297), true);
  assert.equal(validGroupPlanPrices(997, 0), true);
  assert.equal(validGroupPlanPrices(0, 297), false);
  assert.equal(validGroupPlanPrices(997, -1), false);
  assert.equal(validGroupPlanPrices(Number.NaN, 297), false);
});
