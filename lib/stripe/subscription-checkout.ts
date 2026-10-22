import 'server-only';

import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { logPlatformAudit } from '@/lib/platform-audit';
import { releaseTenantAccess } from '@/lib/billing/release-access';
import {
  INVOICE_DAYS_UNTIL_DUE,
  mapStripeSubscriptionStatus,
  planPriceCents,
  stripeProductId,
  SUBSCRIPTION_PURPOSE,
  subscriptionPeriodEnd,
  subscriptionPeriodStart,
  tenantStatusFor,
  TRIAL_DAYS,
  type CheckoutMethod,
} from '@/lib/billing/subscription-rules';
import { getStripeClient } from './client';
import { requireStripeCheckoutConfiguration } from './config';

export class StripeSubscriptionCheckoutError extends Error {
  constructor(readonly code: 'PLAN_PRICE_INVALID' | 'ALREADY_SUBSCRIBED' | 'STRIPE_CHECKOUT_URL_MISSING', message: string) {
    super(message);
    this.name = 'StripeSubscriptionCheckoutError';
  }
}

type CheckoutPlan = { id: string; slug: string; name: string; price: unknown; billingCycle: string };

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.flipform.com.br').replace(/\/+$/, '');
}

/** One Stripe product per plan, created the first time it is sold. */
async function ensurePlanProduct(stripe: Stripe, plan: CheckoutPlan) {
  const id = stripeProductId(plan.slug);
  try {
    const product = await stripe.products.retrieve(id);
    if (product.name !== `FlipForm ${plan.name}` || !product.active) {
      await stripe.products.update(id, { name: `FlipForm ${plan.name}`, active: true });
    }
    return id;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== 'resource_missing') throw error;
    await stripe.products.create({ id, name: `FlipForm ${plan.name}`, metadata: { planSlug: plan.slug } }, { idempotencyKey: `flipform-product:${id}` });
    return id;
  }
}

/**
 * Starts the subscription of a company created at the public checkout, with a free trial.
 * Card: Stripe's own page collects the card (the card never passes through FlipForm) and access
 * opens when Stripe confirms it. Pix/boleto: the subscription starts now, access opens now, and at
 * the end of the trial Stripe e-mails the invoice, payable by Pix or boleto (card too).
 */
export async function startStripeSubscription(input: {
  tenant: { id: string; name: string };
  plan: CheckoutPlan;
  email: string;
  name: string;
  phone: string | null;
  method: CheckoutMethod;
}) {
  const config = requireStripeCheckoutConfiguration();
  const amount = planPriceCents(input.plan.price);
  if (!amount) throw new StripeSubscriptionCheckoutError('PLAN_PRICE_INVALID', 'Plano sem preço válido.');

  const existing = await prisma.subscription.findFirst({
    where: { tenantId: input.tenant.id, provider: 'stripe', status: { in: ['trialing', 'active', 'past_due'] } },
    select: { id: true },
  });
  if (existing) throw new StripeSubscriptionCheckoutError('ALREADY_SUBSCRIBED', 'Esta empresa já tem uma assinatura.');

  const stripe = getStripeClient();
  const productId = await ensurePlanProduct(stripe, input.plan);
  const metadata = { purpose: SUBSCRIPTION_PURPOSE, tenantId: input.tenant.id, planId: input.plan.id, planSlug: input.plan.slug, stripeMode: config.mode };
  const interval: 'month' | 'year' = input.plan.billingCycle === 'yearly' ? 'year' : 'month';

  const previous = await prisma.subscription.findFirst({
    where: { tenantId: input.tenant.id, provider: 'stripe', providerCustomerId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { providerCustomerId: true },
  });
  const customerId = previous?.providerCustomerId || (await stripe.customers.create({
    email: input.email,
    name: input.tenant.name || input.name,
    phone: input.phone || undefined,
    preferred_locales: ['pt-BR'],
    metadata: { tenantId: input.tenant.id, contactName: input.name },
  })).id;

  if (input.method === 'card') {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: input.tenant.id,
      locale: 'pt-BR',
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      line_items: [{
        quantity: 1,
        price_data: { currency: 'brl', unit_amount: amount, recurring: { interval }, product: productId },
      }],
      subscription_data: { trial_period_days: TRIAL_DAYS, metadata },
      metadata,
      success_url: `${appBaseUrl()}/checkout/success?trial=1&method=card`,
      cancel_url: `${appBaseUrl()}/checkout/${encodeURIComponent(input.plan.slug)}`,
    } as unknown as Stripe.Checkout.SessionCreateParams);
    if (!session.url) throw new StripeSubscriptionCheckoutError('STRIPE_CHECKOUT_URL_MISSING', 'Stripe não devolveu o link de pagamento.');
    await logPlatformAudit({
      tenantId: input.tenant.id, userId: null, entityType: 'checkout', entityId: session.id,
      action: 'billing.checkout_access_pending', metadata: { provider: 'stripe', method: 'card', planSlug: input.plan.slug },
    });
    return { checkoutUrl: session.url, status: 'pending_payment' as const };
  }

  // Pix / boleto: invoices sent by Stripe every cycle, payable by Pix, boleto or card.
  const created = await stripe.subscriptions.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: INVOICE_DAYS_UNTIL_DUE,
    trial_period_days: TRIAL_DAYS,
    items: [{ quantity: 1, price_data: { currency: 'brl', unit_amount: amount, recurring: { interval }, product: productId } }],
    payment_settings: { payment_method_types: ['pix', 'boleto', 'card'] },
    metadata,
  } as unknown as Stripe.SubscriptionCreateParams, { idempotencyKey: `flipform-subscription:${input.tenant.id}:${customerId}:${input.plan.id}:${input.method}` });

  const status = mapStripeSubscriptionStatus(created.status);
  const subscription = await prisma.subscription.create({
    data: {
      tenantId: input.tenant.id,
      planId: input.plan.id,
      status,
      provider: 'stripe',
      paymentProvider: 'stripe',
      paymentRequired: true,
      providerCustomerId: customerId,
      providerSubscriptionId: created.id,
      currentPeriodStart: subscriptionPeriodStart(created),
      currentPeriodEnd: subscriptionPeriodEnd(created),
      nextDueDate: subscriptionPeriodEnd(created),
    },
  });
  await prisma.tenant.update({ where: { id: input.tenant.id }, data: { planId: input.plan.id, nextDueDate: subscriptionPeriodEnd(created) } });
  await logPlatformAudit({
    tenantId: input.tenant.id, userId: null, entityType: 'checkout', entityId: subscription.id,
    action: 'billing.checkout_subscription_created', metadata: { provider: 'stripe', method: input.method, planSlug: input.plan.slug },
  });
  const tenantStatus = tenantStatusFor(status);
  if (tenantStatus === 'trial' || tenantStatus === 'active') {
    await releaseTenantAccess({ tenantId: input.tenant.id, subscriptionId: subscription.id, tenantStatus, provider: 'stripe', reference: created.id });
  }
  return { checkoutUrl: `${appBaseUrl()}/checkout/success?trial=1&method=${input.method}`, status: 'trialing' as const };
}
