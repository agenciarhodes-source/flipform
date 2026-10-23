import 'server-only';

import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { planPriceCents, subscriptionPeriodEnd } from '@/lib/billing/subscription-rules';
import { getStripeClient } from './client';
import { requireStripeConfiguration } from './config';
import { ensurePlanProduct, type CheckoutPlan } from './subscription-checkout';

export class StripeManageError extends Error {
  constructor(readonly code: 'NO_STRIPE_SUBSCRIPTION' | 'PLAN_PRICE_INVALID' | 'SUBSCRIPTION_ITEM_MISSING', readonly status: number, message: string) {
    super(message);
    this.name = 'StripeManageError';
  }
}

/** The company's current subscription paid through Stripe. */
export async function currentStripeSubscription(tenantId: string) {
  return prisma.subscription.findFirst({
    where: { tenantId, provider: 'stripe', providerSubscriptionId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, planId: true, providerCustomerId: true, providerSubscriptionId: true },
  });
}

/**
 * Stripe's own page where the customer updates the card and sees or downloads every invoice.
 * Card details never pass through FlipForm.
 */
export async function createBillingPortalUrl(tenantId: string, returnUrl: string) {
  requireStripeConfiguration();
  const subscription = await currentStripeSubscription(tenantId);
  if (!subscription?.providerCustomerId) {
    throw new StripeManageError('NO_STRIPE_SUBSCRIPTION', 404, 'Esta empresa não tem assinatura pelo Stripe.');
  }
  const session = await getStripeClient().billingPortal.sessions.create({
    customer: subscription.providerCustomerId,
    return_url: returnUrl,
    locale: 'pt-BR',
  } as Stripe.BillingPortal.SessionCreateParams);
  return session.url;
}

/**
 * Moves the Stripe subscription to another plan. Stripe charges or credits the difference for the
 * rest of the period on the next invoice (proration); in the trial nothing is charged.
 */
export async function changeStripeSubscriptionPlan(tenantId: string, plan: CheckoutPlan) {
  requireStripeConfiguration();
  const amount = planPriceCents(plan.price);
  if (!amount) throw new StripeManageError('PLAN_PRICE_INVALID', 400, 'Plano sem preço válido.');
  const subscription = await currentStripeSubscription(tenantId);
  if (!subscription?.providerSubscriptionId) {
    throw new StripeManageError('NO_STRIPE_SUBSCRIPTION', 404, 'Esta empresa não tem assinatura pelo Stripe.');
  }
  const stripe = getStripeClient();
  const current = await stripe.subscriptions.retrieve(subscription.providerSubscriptionId);
  const item = current.items?.data?.[0];
  if (!item) throw new StripeManageError('SUBSCRIPTION_ITEM_MISSING', 409, 'A assinatura no Stripe está sem item.');
  const productId = await ensurePlanProduct(stripe, plan);
  const interval: 'month' | 'year' = plan.billingCycle === 'yearly' ? 'year' : 'month';
  await stripe.subscriptions.update(subscription.providerSubscriptionId, {
    items: [{ id: item.id, quantity: 1, price_data: { currency: 'brl', unit_amount: amount, recurring: { interval }, product: productId } }],
    proration_behavior: 'create_prorations',
    metadata: { ...(current.metadata || {}), planId: plan.id, planSlug: plan.slug },
  } as unknown as Stripe.SubscriptionUpdateParams);
  return subscription.id;
}

/**
 * Cancels at the end of the period already paid (or of the trial): access continues until then,
 * and Stripe's "subscription deleted" notice closes the company at that moment.
 */
export async function cancelStripeSubscriptionAtPeriodEnd(tenantId: string) {
  requireStripeConfiguration();
  const subscription = await currentStripeSubscription(tenantId);
  if (!subscription?.providerSubscriptionId) {
    throw new StripeManageError('NO_STRIPE_SUBSCRIPTION', 404, 'Esta empresa não tem assinatura pelo Stripe.');
  }
  const updated = await getStripeClient().subscriptions.update(subscription.providerSubscriptionId, { cancel_at_period_end: true });
  return { subscriptionId: subscription.id, endsAt: subscriptionPeriodEnd(updated) };
}
