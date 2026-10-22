/**
 * Pure rules of the FlipForm subscription paid through Stripe, so they are easy to test.
 * Card: charged automatically every cycle. Pix and boleto: Stripe sends a monthly invoice the
 * customer pays (Pix Automático is not offered to Brazilian Stripe accounts).
 */

export const SUBSCRIPTION_PURPOSE = 'flipform_subscription';
export const TRIAL_DAYS = 7;
/** Days the customer has to pay a Pix/boleto invoice. */
export const INVOICE_DAYS_UNTIL_DUE = 3;
/** The plans sold on the public checkout. */
export const PUBLIC_PLAN_SLUGS = ['starter', 'growth', 'pro'] as const;

export type CheckoutMethod = 'card' | 'pix' | 'boleto';
export type OurSubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled' | 'paused';
export type OurTenantStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled';

export function stripeSubscriptionsEnabled(env: Record<string, string | undefined> = process.env) {
  return String(env.STRIPE_SUBSCRIPTIONS_ENABLED || '').trim().toLowerCase() === 'true';
}

export function checkoutMethod(value: unknown): CheckoutMethod {
  const method = String(value || '').trim().toLowerCase();
  if (method === 'card' || method === 'credit_card' || method === 'credit-card') return 'card';
  if (method === 'boleto' || method === 'bank_slip' || method === 'bank-slip') return 'boleto';
  return 'pix';
}

/** Price in cents from the plan price (a Decimal as text or number). */
export function planPriceCents(price: unknown) {
  const value = Math.round(Number(String(price ?? '').replace(',', '.')) * 100);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

/** Stripe subscription status → the FlipForm subscription status. */
export function mapStripeSubscriptionStatus(status: unknown): OurSubscriptionStatus {
  switch (String(status || '')) {
    case 'trialing': return 'trialing';
    case 'active': return 'active';
    case 'past_due':
    case 'incomplete': return 'past_due';
    case 'unpaid': return 'suspended';
    case 'paused': return 'paused';
    case 'canceled':
    case 'incomplete_expired': return 'canceled';
    default: return 'past_due';
  }
}

/** What the company status becomes for a subscription status. */
export function tenantStatusFor(status: OurSubscriptionStatus): OurTenantStatus {
  if (status === 'trialing') return 'trial';
  if (status === 'active') return 'active';
  if (status === 'past_due') return 'past_due';
  if (status === 'canceled') return 'canceled';
  return 'suspended';
}

/** "5 usuários", "Usuários ilimitados" — 0 in a plan limit means no limit. */
export function planLimit(value: number, singular: string, plural: string) {
  if (!value || value <= 0) return `${plural.charAt(0).toUpperCase()}${plural.slice(1)} ilimitados`;
  return `${value.toLocaleString('pt-BR')} ${value === 1 ? singular : plural}`;
}

export function planFeatures(plan: { maxUsers: number; maxForms: number; maxPipelines: number; maxLeadsPerMonth: number }) {
  return [
    planLimit(plan.maxUsers, 'usuário', 'usuários'),
    planLimit(plan.maxForms, 'formulário', 'formulários'),
    planLimit(plan.maxPipelines, 'pipeline', 'pipelines'),
    plan.maxLeadsPerMonth > 0 ? `${plan.maxLeadsPerMonth.toLocaleString('pt-BR')} leads/mês` : 'Leads ilimitados',
  ];
}

/** Stripe product id for a plan (stable, so the same product is reused). */
export function stripeProductId(slug: string) {
  return `flipform_plan_${slug.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()}`;
}

type AnyRecord = Record<string, any>;

/** The subscription of an invoice, in old and new Stripe API shapes. */
export function invoiceSubscriptionId(source: unknown): string | null {
  const invoice = source as AnyRecord;
  const direct = invoice?.subscription;
  if (typeof direct === 'string') return direct;
  if (direct && typeof direct.id === 'string') return direct.id;
  const parent = invoice?.parent?.subscription_details?.subscription;
  if (typeof parent === 'string') return parent;
  if (parent && typeof parent.id === 'string') return parent.id;
  return null;
}

/** The FlipForm company of an invoice, from the subscription metadata. */
export function invoiceTenantId(source: unknown): string | null {
  const invoice = source as AnyRecord;
  const value = invoice?.subscription_details?.metadata?.tenantId
    || invoice?.parent?.subscription_details?.metadata?.tenantId
    || invoice?.metadata?.tenantId;
  return typeof value === 'string' && value ? value : null;
}

/** End of the current period (or of the trial), in old and new Stripe API shapes. */
export function subscriptionPeriodEnd(source: unknown): Date | null {
  const subscription = source as AnyRecord;
  const seconds = subscription?.current_period_end ?? subscription?.items?.data?.[0]?.current_period_end ?? subscription?.trial_end;
  return typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000) : null;
}

export function subscriptionPeriodStart(source: unknown): Date | null {
  const subscription = source as AnyRecord;
  const seconds = subscription?.current_period_start ?? subscription?.items?.data?.[0]?.current_period_start;
  return typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000) : null;
}

/** Stripe invoice status → FlipForm payment status (null: not a payment to record). */
export function invoicePaymentStatus(eventType: string, source: unknown): 'pending' | 'received' | 'overdue' | 'failed' | null {
  const invoice = source as AnyRecord;
  if (eventType === 'invoice.paid' || invoice?.status === 'paid') return 'received';
  if (eventType === 'invoice.overdue') return 'overdue';
  if (eventType === 'invoice.payment_failed') return 'failed';
  if (invoice?.status === 'open') return 'pending';
  return null;
}
