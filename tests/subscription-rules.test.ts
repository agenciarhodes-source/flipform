import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkoutMethod,
  invoicePaymentStatus,
  invoiceSubscriptionId,
  invoiceTenantId,
  mapStripeSubscriptionStatus,
  planFeatures,
  planPriceCents,
  stripeProductId,
  stripeSubscriptionsEnabled,
  isPlanSlug,
  isSellablePlan,
  planIncludesAi,
  subscriptionPeriodEnd,
  tenantStatusFor,
} from '../lib/billing/subscription-rules';

test('a assinatura pelo Stripe só liga com a chave', () => {
  assert.equal(stripeSubscriptionsEnabled({}), false);
  assert.equal(stripeSubscriptionsEnabled({ STRIPE_SUBSCRIPTIONS_ENABLED: 'true' }), true);
  assert.equal(stripeSubscriptionsEnabled({ STRIPE_SUBSCRIPTIONS_ENABLED: 'yes' }), false);
});

test('forma de pagamento e preço em centavos', () => {
  assert.equal(checkoutMethod('card'), 'card');
  assert.equal(checkoutMethod('credit_card'), 'card');
  assert.equal(checkoutMethod('boleto'), 'boleto');
  assert.equal(checkoutMethod('pix'), 'pix');
  assert.equal(checkoutMethod(undefined), 'pix');
  assert.equal(planPriceCents('197.00'), 19700);
  assert.equal(planPriceCents(49), 4900);
  assert.equal(planPriceCents('0.00'), 0);
  assert.equal(planPriceCents('abc'), 0);
});

test('status do Stripe vira status da assinatura e da empresa', () => {
  assert.equal(mapStripeSubscriptionStatus('trialing'), 'trialing');
  assert.equal(mapStripeSubscriptionStatus('active'), 'active');
  assert.equal(mapStripeSubscriptionStatus('past_due'), 'past_due');
  assert.equal(mapStripeSubscriptionStatus('incomplete'), 'past_due');
  assert.equal(mapStripeSubscriptionStatus('unpaid'), 'suspended');
  assert.equal(mapStripeSubscriptionStatus('canceled'), 'canceled');
  assert.equal(mapStripeSubscriptionStatus('incomplete_expired'), 'canceled');
  assert.equal(tenantStatusFor('trialing'), 'trial');
  assert.equal(tenantStatusFor('active'), 'active');
  assert.equal(tenantStatusFor('past_due'), 'past_due');
  assert.equal(tenantStatusFor('paused'), 'suspended');
});

test('fatura e assinatura nos formatos antigo e novo da API do Stripe', () => {
  assert.equal(invoiceSubscriptionId({ subscription: 'sub_1' }), 'sub_1');
  assert.equal(invoiceSubscriptionId({ parent: { subscription_details: { subscription: 'sub_2' } } }), 'sub_2');
  assert.equal(invoiceSubscriptionId({}), null);
  assert.equal(invoiceTenantId({ parent: { subscription_details: { metadata: { tenantId: 't1' } } } }), 't1');
  assert.equal(invoiceTenantId({ subscription_details: { metadata: { tenantId: 't2' } } }), 't2');
  assert.equal(subscriptionPeriodEnd({ current_period_end: 1_800_000_000 })?.getTime(), 1_800_000_000_000);
  assert.equal(subscriptionPeriodEnd({ items: { data: [{ current_period_end: 1_800_000_100 }] } })?.getTime(), 1_800_000_100_000);
  assert.equal(subscriptionPeriodEnd({}), null);
});

test('status do pagamento a partir dos eventos de fatura', () => {
  assert.equal(invoicePaymentStatus('invoice.paid', { status: 'paid' }), 'received');
  assert.equal(invoicePaymentStatus('invoice.finalized', { status: 'open' }), 'pending');
  assert.equal(invoicePaymentStatus('invoice.overdue', { status: 'open' }), 'overdue');
  assert.equal(invoicePaymentStatus('invoice.payment_failed', { status: 'open' }), 'failed');
  assert.equal(invoicePaymentStatus('invoice.finalized', { status: 'draft' }), null);
});

test('planos à venda: ativos e com preço; Premium inclui a IA', () => {
  assert.equal(isSellablePlan({ isActive: true, price: '349.00' }), true);
  assert.equal(isSellablePlan({ isActive: true, price: '0.00' }), false);
  assert.equal(isSellablePlan({ isActive: false, price: '1497.00' }), false);
  assert.equal(planIncludesAi('premium'), true);
  assert.equal(planIncludesAi('premium-pro'), true);
  assert.equal(planIncludesAi('business'), false);
  assert.equal(isPlanSlug('premium-pro'), true);
  assert.equal(isPlanSlug('../admin'), false);
});

test('limites do plano e produto do Stripe', () => {
  assert.deepEqual(planFeatures({ maxUsers: 5, maxForms: 1, maxPipelines: 0, maxLeadsPerMonth: 3000 }),
    ['5 usuários', '1 formulário', 'Pipelines ilimitados', '3.000 leads/mês']);
  assert.equal(stripeProductId('growth'), 'flipform_plan_growth');
  assert.equal(stripeProductId('premium pro'), 'flipform_plan_premium_pro');
});
