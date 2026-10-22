import 'server-only';

import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { calculateGracePeriodEndsAt } from '@/lib/billing-access';
import { releaseTenantAccess } from '@/lib/billing/release-access';
import {
  invoicePaymentStatus,
  invoiceSubscriptionId,
  invoiceTenantId,
  mapStripeSubscriptionStatus,
  SUBSCRIPTION_PURPOSE,
  subscriptionPeriodEnd,
  subscriptionPeriodStart,
  tenantStatusFor,
  type OurSubscriptionStatus,
} from '@/lib/billing/subscription-rules';
import { getStripeClient } from './client';
import { requireStripeConfiguration } from './config';

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);
const INVOICE_EVENTS = new Set(['invoice.finalized', 'invoice.paid', 'invoice.payment_failed', 'invoice.overdue']);
const CHECKOUT_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);

type AnyRecord = Record<string, any>;

/** Whether the event belongs to the FlipForm subscription (the rest goes to the credit top-ups). */
export function isStripeSubscriptionEvent(event: Stripe.Event) {
  const object = event.data.object as unknown as AnyRecord;
  if (CHECKOUT_EVENTS.has(event.type)) return object?.mode === 'subscription' && object?.metadata?.purpose === SUBSCRIPTION_PURPOSE;
  return SUBSCRIPTION_EVENTS.has(event.type) || INVOICE_EVENTS.has(event.type);
}

/** Moves the company and its subscription to the status Stripe reports. Courtesy plans are never touched. */
async function applySubscriptionStatus(row: { id: string; tenantId: string; status: string }, status: OurSubscriptionStatus, stripeSubscription: unknown, reference: string) {
  if (row.status === 'courtesy') return;
  const periodEnd = subscriptionPeriodEnd(stripeSubscription);
  await prisma.subscription.update({
    where: { id: row.id },
    data: {
      status,
      currentPeriodStart: subscriptionPeriodStart(stripeSubscription) ?? undefined,
      currentPeriodEnd: periodEnd ?? undefined,
      nextDueDate: periodEnd ?? undefined,
      canceledAt: status === 'canceled' ? new Date() : undefined,
      gracePeriodEndsAt: status === 'past_due' ? undefined : null,
    },
  });
  if (periodEnd) await prisma.tenant.update({ where: { id: row.tenantId }, data: { nextDueDate: periodEnd } }).catch(() => undefined);

  const tenantStatus = tenantStatusFor(status);
  if (tenantStatus === 'trial' || tenantStatus === 'active') {
    await releaseTenantAccess({ tenantId: row.tenantId, subscriptionId: row.id, tenantStatus, provider: 'stripe', reference });
    return;
  }
  if (status === 'past_due') {
    // Grace period from the first time it fell behind; access stays open until it ends.
    const current = await prisma.subscription.findUnique({ where: { id: row.id }, select: { gracePeriodEndsAt: true } });
    if (!current?.gracePeriodEndsAt) {
      await prisma.subscription.update({ where: { id: row.id }, data: { gracePeriodEndsAt: calculateGracePeriodEndsAt(new Date()) } });
    }
  }
  await prisma.tenant.updateMany({
    where: { id: row.tenantId, status: { notIn: ['canceled', 'blocked'] } },
    data: { status: tenantStatus },
  });
  await logAudit({
    tenantId: row.tenantId, entityType: 'billing', entityId: row.id,
    action: `billing.subscription_${status}`, metadata: { provider: 'stripe', reference },
  });
}

async function findOurSubscription(stripeSubscriptionId: string | null, tenantId: string | null) {
  if (!stripeSubscriptionId) return null;
  const row = await prisma.subscription.findFirst({
    where: { provider: 'stripe', providerSubscriptionId: stripeSubscriptionId },
    select: { id: true, tenantId: true, status: true },
  });
  // The metadata, when present, must point to the same company.
  if (row && tenantId && row.tenantId !== tenantId) return null;
  return row;
}

async function handleCheckoutCompleted(session: AnyRecord) {
  const tenantId = typeof session.metadata?.tenantId === 'string' ? session.metadata.tenantId : null;
  const planId = typeof session.metadata?.planId === 'string' ? session.metadata.planId : null;
  const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  if (!tenantId || !planId || !stripeSubscriptionId) return { status: 'ignored' as const };
  const [tenant, plan] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }),
    prisma.plan.findUnique({ where: { id: planId }, select: { id: true } }),
  ]);
  if (!tenant || !plan) return { status: 'ignored' as const };

  const stripeSubscription = await getStripeClient().subscriptions.retrieve(stripeSubscriptionId);
  if ((stripeSubscription.metadata as AnyRecord)?.tenantId !== tenantId) return { status: 'ignored' as const };
  const status = mapStripeSubscriptionStatus(stripeSubscription.status);
  let row = await findOurSubscription(stripeSubscriptionId, tenantId);
  if (!row) {
    row = await prisma.subscription.create({
      data: {
        tenantId, planId, status,
        provider: 'stripe', paymentProvider: 'stripe', paymentRequired: true,
        providerCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
        providerSubscriptionId: stripeSubscriptionId,
        currentPeriodStart: subscriptionPeriodStart(stripeSubscription),
        currentPeriodEnd: subscriptionPeriodEnd(stripeSubscription),
        nextDueDate: subscriptionPeriodEnd(stripeSubscription),
      },
      select: { id: true, tenantId: true, status: true },
    });
    await prisma.tenant.update({ where: { id: tenantId }, data: { planId } });
  }
  await applySubscriptionStatus(row, status, stripeSubscription, session.id);
  return { status: 'subscription_started' as const };
}

async function handleSubscriptionEvent(eventType: string, subscription: AnyRecord) {
  const row = await findOurSubscription(subscription.id, subscription.metadata?.tenantId || null);
  if (!row) return { status: 'ignored' as const };
  const status = eventType === 'customer.subscription.deleted' ? 'canceled' : mapStripeSubscriptionStatus(subscription.status);
  await applySubscriptionStatus(row, status, subscription, subscription.id);
  return { status: `subscription_${status}` };
}

async function handleInvoiceEvent(eventType: string, invoice: AnyRecord) {
  const row = await findOurSubscription(invoiceSubscriptionId(invoice), invoiceTenantId(invoice));
  if (!row) return { status: 'ignored' as const };
  const paymentStatus = invoicePaymentStatus(eventType, invoice);
  const amount = Number(invoice.amount_due ?? invoice.total ?? 0);
  // Trial invoices (R$ 0) are not payments.
  if (!paymentStatus || amount <= 0) return { status: 'ignored' as const };

  const data = {
    status: paymentStatus,
    value: new Prisma.Decimal((amount / 100).toFixed(2)),
    dueDate: typeof invoice.due_date === 'number' ? new Date(invoice.due_date * 1000) : null,
    paidAt: paymentStatus === 'received'
      ? new Date(((invoice.status_transitions?.paid_at as number | undefined) || Math.floor(Date.now() / 1000)) * 1000)
      : null,
    invoiceUrl: typeof invoice.hosted_invoice_url === 'string' ? invoice.hosted_invoice_url : null,
    billingType: invoice.collection_method === 'send_invoice' ? 'INVOICE' : 'CREDIT_CARD',
    rawPayload: { id: invoice.id, number: invoice.number || null, status: invoice.status, event: eventType } as Prisma.InputJsonValue,
  };
  const existing = await prisma.payment.findFirst({ where: { provider: 'stripe', providerPaymentId: invoice.id }, select: { id: true, status: true } });
  // A paid invoice never goes back to pending or overdue (events can arrive out of order).
  if (existing?.status === 'received' && paymentStatus !== 'received') return { status: 'ignored' as const };
  if (existing) {
    await prisma.payment.update({ where: { id: existing.id }, data });
  } else {
    await prisma.payment.create({ data: { ...data, tenantId: row.tenantId, subscriptionId: row.id, provider: 'stripe', providerPaymentId: invoice.id } });
  }

  if (paymentStatus === 'received') {
    if (row.status !== 'courtesy') {
      await prisma.subscription.update({ where: { id: row.id }, data: { status: 'active', gracePeriodEndsAt: null } });
      await releaseTenantAccess({ tenantId: row.tenantId, subscriptionId: row.id, tenantStatus: 'active', provider: 'stripe', reference: invoice.id });
    }
    await logAudit({ tenantId: row.tenantId, entityType: 'billing', entityId: invoice.id, action: 'billing.payment_received', metadata: { provider: 'stripe' } });
  } else if (paymentStatus === 'overdue' && row.status !== 'courtesy' && row.status !== 'canceled') {
    const due = data.dueDate || new Date();
    await prisma.subscription.update({ where: { id: row.id }, data: { status: 'past_due', gracePeriodEndsAt: calculateGracePeriodEndsAt(due) } });
    await prisma.tenant.updateMany({ where: { id: row.tenantId, status: { notIn: ['canceled', 'blocked'] } }, data: { status: 'past_due' } });
    await logAudit({ tenantId: row.tenantId, entityType: 'billing', entityId: invoice.id, action: 'billing.subscription_past_due', metadata: { provider: 'stripe' } });
  }
  return { status: `invoice_${paymentStatus}` };
}

/**
 * The FlipForm subscription events from Stripe (signature already verified by the route).
 * Each event is processed once; events of another Stripe environment are refused.
 */
export async function applyStripeSubscriptionEvent(event: Stripe.Event) {
  const config = requireStripeConfiguration();
  if (event.livemode !== (config.mode === 'live')) return { status: 'environment_mismatch' as const };

  const seen = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider: 'stripe', eventId: event.id } }, select: { id: true } });
  if (seen) return { status: 'duplicate' as const };

  const object = event.data.object as unknown as AnyRecord;
  let result: { status: string };
  if (CHECKOUT_EVENTS.has(event.type)) result = await handleCheckoutCompleted(object);
  else if (SUBSCRIPTION_EVENTS.has(event.type)) result = await handleSubscriptionEvent(event.type, object);
  else result = await handleInvoiceEvent(event.type, object);

  const tenantId = typeof object?.metadata?.tenantId === 'string' ? object.metadata.tenantId : invoiceTenantId(object);
  await prisma.webhookEvent.create({
    data: {
      provider: 'stripe',
      eventId: event.id,
      eventType: event.type,
      providerPaymentId: event.type.startsWith('invoice.') ? String(object?.id || '') || null : null,
      rawPayload: { type: event.type, objectId: object?.id || null, result: result.status } as Prisma.InputJsonValue,
      processedAt: new Date(),
      tenantId: tenantId && await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }) ? tenantId : null,
    },
  }).catch(() => undefined);
  return result;
}
