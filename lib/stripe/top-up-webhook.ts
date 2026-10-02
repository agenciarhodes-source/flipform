import 'server-only';

import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recordFlipAiCreditEntryWithDb, validateFlipAiCreditMutation } from '@/lib/flip-ai/credits';
import { getStripeClient } from './client';
import { requireStripeConfiguration, type StripeEnvironmentMode } from './config';

const PROVIDER = 'stripe';
const PURPOSE = 'flip_ai_top_up';

export class StripeTopUpWebhookError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'StripeTopUpWebhookError';
  }
}

export type VerifiedStripeTopUpPayment = {
  eventId: string;
  eventType: string;
  sessionId: string;
  paymentIntentId: string;
  tenantId: string;
  orderId: string;
  amountCents: number;
  currency: string;
  paymentMethod: string;
  eventCreatedAt: Date;
  stripeMode: StripeEnvironmentMode;
};

function ensureObjectId(value: string, prefix: string, field: string) {
  if (!value.startsWith(prefix)) {
    throw new StripeTopUpWebhookError(
      'STRIPE_WEBHOOK_OBJECT_ENVIRONMENT_MISMATCH',
      400,
      `${field} não pertence ao ambiente Stripe configurado.`,
    );
  }
  return value;
}

function metadataValue(metadata: Stripe.Metadata | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

export async function retrieveVerifiedStripeTopUpPayment(event: Stripe.Event): Promise<VerifiedStripeTopUpPayment | null> {
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    return null;
  }
  const stripeConfig = requireStripeConfiguration();
  const expectedLivemode = stripeConfig.mode === 'live';
  if (event.livemode !== expectedLivemode) {
    throw new StripeTopUpWebhookError(
      'STRIPE_WEBHOOK_ENVIRONMENT_MISMATCH',
      400,
      'O evento recebido não pertence ao ambiente Stripe configurado.',
    );
  }

  const object = event.data.object;
  if (!object || typeof object !== 'object' || !('id' in object) || typeof object.id !== 'string') {
    throw new StripeTopUpWebhookError('STRIPE_WEBHOOK_SESSION_MISSING', 400, 'Evento Stripe sem Checkout Session válida.');
  }
  const expectedSessionPrefix = stripeConfig.mode === 'live' ? 'cs_live_' : 'cs_test_';
  const sessionId = ensureObjectId(object.id, expectedSessionPrefix, 'Checkout Session');
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.livemode !== expectedLivemode || session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid') {
    throw new StripeTopUpWebhookError(
      'STRIPE_WEBHOOK_SESSION_NOT_PAID',
      409,
      'A Stripe ainda não confirma esta sessão como paga e concluída.',
    );
  }

  const tenantId = metadataValue(session.metadata, 'tenantId');
  const orderId = metadataValue(session.metadata, 'topUpOrderId');
  const purpose = metadataValue(session.metadata, 'purpose');
  if (!tenantId || !orderId || purpose !== PURPOSE || session.client_reference_id !== orderId) {
    throw new StripeTopUpWebhookError(
      'STRIPE_WEBHOOK_SESSION_BINDING_INVALID',
      400,
      'A sessão Stripe não corresponde a uma recarga Flip AI válida.',
    );
  }
  if (!Number.isSafeInteger(session.amount_total) || !session.amount_total || session.amount_total <= 0
    || session.currency?.toLowerCase() !== 'brl') {
    throw new StripeTopUpWebhookError(
      'STRIPE_WEBHOOK_SESSION_AMOUNT_INVALID',
      400,
      'A sessão Stripe possui valor ou moeda inválidos.',
    );
  }

  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;
  if (!paymentIntentId) {
    throw new StripeTopUpWebhookError(
      'STRIPE_WEBHOOK_PAYMENT_INTENT_MISSING',
      409,
      'A sessão paga não possui PaymentIntent confirmado.',
    );
  }
  ensureObjectId(paymentIntentId, 'pi_', 'PaymentIntent');
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (paymentIntent.livemode !== expectedLivemode || paymentIntent.status !== 'succeeded') {
    throw new StripeTopUpWebhookError(
      'STRIPE_WEBHOOK_PAYMENT_INTENT_NOT_SUCCEEDED',
      409,
      'O PaymentIntent ainda não foi confirmado como sucedido.',
    );
  }
  if (paymentIntent.amount_received !== session.amount_total
    || paymentIntent.currency.toLowerCase() !== 'brl'
    || metadataValue(paymentIntent.metadata, 'tenantId') !== tenantId
    || metadataValue(paymentIntent.metadata, 'topUpOrderId') !== orderId
    || metadataValue(paymentIntent.metadata, 'purpose') !== PURPOSE) {
    throw new StripeTopUpWebhookError(
      'STRIPE_WEBHOOK_PAYMENT_INTENT_MISMATCH',
      400,
      'O PaymentIntent não corresponde ao pedido, tenant, valor ou moeda esperados.',
    );
  }

  return {
    eventId: event.id,
    eventType: event.type,
    sessionId,
    paymentIntentId,
    tenantId,
    orderId,
    amountCents: session.amount_total,
    currency: 'BRL',
    paymentMethod: paymentIntent.payment_method_types?.[0] || 'card',
    eventCreatedAt: new Date(event.created * 1000),
    stripeMode: stripeConfig.mode,
  };
}

type LockedTopUp = {
  id: string;
  tenantId: string;
  status: string;
  amountCents: number;
  currency: string;
  credits: number;
  paymentProvider: string | null;
  providerPaymentId: string | null;
  stripeCheckoutSessionId: string | null;
  creditLedgerEntryId: string | null;
};

export async function applyVerifiedStripeTopUpPayment(input: VerifiedStripeTopUpPayment) {
  return prisma.$transaction(async (db) => {
    await db.webhookEvent.upsert({
      where: { provider_eventId: { provider: PROVIDER, eventId: input.eventId } },
      create: {
        provider: PROVIDER,
        eventId: input.eventId,
        eventType: input.eventType,
        providerPaymentId: input.paymentIntentId,
        tenantId: input.tenantId,
        rawPayload: {
          sessionId: input.sessionId,
          paymentIntentId: input.paymentIntentId,
          stripeMode: input.stripeMode,
          testMode: input.stripeMode === 'test',
        },
      },
      update: {},
    });

    const events = await db.$queryRaw<Array<{ id: string; processedAt: Date | null; tenantId: string | null }>>(Prisma.sql`
      SELECT id, processed_at AS "processedAt", tenant_id AS "tenantId"
      FROM webhook_events
      WHERE provider = ${PROVIDER} AND event_id = ${input.eventId}
      FOR UPDATE
    `);
    const webhook = events[0];
    if (!webhook) {
      throw new StripeTopUpWebhookError('STRIPE_WEBHOOK_EVENT_UNAVAILABLE', 503, 'Não foi possível reservar o evento Stripe.');
    }
    if (webhook.tenantId && webhook.tenantId !== input.tenantId) {
      throw new StripeTopUpWebhookError('STRIPE_WEBHOOK_TENANT_CONFLICT', 409, 'Evento Stripe já pertence a outro tenant.');
    }
    if (webhook.processedAt) {
      const existing = await db.flipAiTopUpOrder.findFirst({
        where: { id: input.orderId, tenantId: input.tenantId },
        select: { status: true, creditLedgerEntryId: true },
      });
      return { reused: true, status: existing?.status || 'unknown', ledgerEntryId: existing?.creditLedgerEntryId || null };
    }

    const rows = await db.$queryRaw<LockedTopUp[]>(Prisma.sql`
      SELECT id, tenant_id AS "tenantId", status,
        amount_cents AS "amountCents", currency, credits,
        payment_provider AS "paymentProvider",
        provider_payment_id AS "providerPaymentId",
        stripe_checkout_session_id AS "stripeCheckoutSessionId",
        credit_ledger_entry_id AS "creditLedgerEntryId"
      FROM flip_ai_top_up_orders
      WHERE tenant_id = ${input.tenantId} AND id = ${input.orderId}
      FOR UPDATE
    `);
    const order = rows[0];
    if (!order) {
      throw new StripeTopUpWebhookError('STRIPE_WEBHOOK_TOP_UP_NOT_FOUND', 404, 'Recarga vinculada ao webhook não encontrada.');
    }
    if (order.status === 'canceled') {
      throw new StripeTopUpWebhookError('STRIPE_WEBHOOK_TOP_UP_CANCELED', 409, 'A recarga foi cancelada e não pode receber crédito.');
    }
    if (order.paymentProvider && order.paymentProvider !== PROVIDER) {
      throw new StripeTopUpWebhookError('STRIPE_WEBHOOK_PROVIDER_CONFLICT', 409, 'A recarga pertence a outro provedor de pagamento.');
    }
    if (order.stripeCheckoutSessionId !== input.sessionId
      || order.amountCents !== input.amountCents
      || order.currency.toUpperCase() !== input.currency.toUpperCase()) {
      throw new StripeTopUpWebhookError(
        'STRIPE_WEBHOOK_ORDER_MISMATCH',
        409,
        'Sessão, valor ou moeda não correspondem à recarga persistida.',
      );
    }
    if (order.providerPaymentId && order.providerPaymentId !== input.paymentIntentId) {
      throw new StripeTopUpWebhookError(
        'STRIPE_WEBHOOK_PAYMENT_REFERENCE_CONFLICT',
        409,
        'A recarga já está vinculada a outro pagamento Stripe.',
      );
    }

    if (order.status === 'credited' && order.creditLedgerEntryId
      && order.providerPaymentId === input.paymentIntentId) {
      const now = new Date();
      await db.webhookEvent.update({
        where: { id: webhook.id },
        data: {
          processedAt: now,
          tenantId: input.tenantId,
          providerPaymentId: input.paymentIntentId,
        },
      });
      return {
        reused: true,
        status: order.status,
        ledgerEntryId: order.creditLedgerEntryId,
      };
    }

    const mutation = validateFlipAiCreditMutation({
      tenantId: input.tenantId,
      idempotencyKey: `top-up:${order.id}`,
      entryType: 'credit',
      amountCredits: order.credits,
      source: 'top_up',
      referenceId: order.id,
    });
    const credit = await recordFlipAiCreditEntryWithDb(db, mutation);
    const now = new Date();

    const updated = await db.flipAiTopUpOrder.update({
      where: { id: order.id },
      data: {
        status: 'credited',
        paymentProvider: PROVIDER,
        providerPaymentId: input.paymentIntentId,
        paymentMethod: input.paymentMethod,
        paidAt: input.eventCreatedAt,
        creditedAt: now,
        creditLedgerEntryId: credit.entryId,
      },
    });

    await db.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: null,
        entityType: 'flip_ai_top_up_order',
        entityId: order.id,
        action: 'platform.flip_ai_stripe_payment_verified',
        metadata: {
          eventId: input.eventId,
          eventType: input.eventType,
          sessionId: input.sessionId,
          paymentIntentId: input.paymentIntentId,
          amountCents: input.amountCents,
          currency: input.currency,
          credits: order.credits,
          ledgerEntryId: credit.entryId,
          balanceAfterCredits: credit.balanceCredits,
          stripeMode: input.stripeMode,
          testMode: input.stripeMode === 'test',
        },
      },
    });

    await db.webhookEvent.update({
      where: { id: webhook.id },
      data: {
        processedAt: now,
        tenantId: input.tenantId,
        providerPaymentId: input.paymentIntentId,
      },
    });

    return {
      reused: credit.reused,
      status: updated.status,
      ledgerEntryId: credit.entryId,
      balanceCredits: credit.balanceCredits,
    };
  });
}
