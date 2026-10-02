import 'server-only';

import { prisma } from '@/lib/prisma';
import { getStripeClient } from '@/lib/stripe/client';
import { requireStripeConfiguration, StripeFoundationConfigError, type StripeEnvironmentMode } from '@/lib/stripe/config';

const PROVIDER = 'stripe';
const PAYMENT_METHOD = 'card_checkout';
const MAX_REFERENCE_LENGTH = 190;

type ReservedCheckout = {
  orderId: string;
  tenantId: string;
  requestKey: string;
  amountCents: number;
  currency: string;
  credits: number;
  attempt: number;
  existingSessionId: string | null;
  existingExpiresAt: Date | null;
};

export class StripeCheckoutError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'StripeCheckoutError';
  }
}

function bounded(value: string, field: string) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > MAX_REFERENCE_LENGTH) {
    throw new StripeCheckoutError(
      'STRIPE_CHECKOUT_INVALID_REFERENCE',
      400,
      `${field} inválido.`,
    );
  }
  return normalized;
}

function checkoutReturnUrls(tenantId: string, orderId: string) {
  const configured = String(process.env.NEXT_PUBLIC_ADMIN_URL || '').trim();
  if (!configured) {
    throw new StripeCheckoutError(
      'STRIPE_CHECKOUT_RETURN_URL_MISSING',
      503,
      'NEXT_PUBLIC_ADMIN_URL não está configurada.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
    const localHttp = parsed.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !localHttp) throw new Error('insecure');
  } catch {
    throw new StripeCheckoutError(
      'STRIPE_CHECKOUT_RETURN_URL_INVALID',
      503,
      'A URL administrativa configurada para retorno da Stripe é inválida.',
    );
  }

  const configuredPath = parsed.pathname.replace(/\/+$/, '');
  const adminBasePath = configuredPath && configuredPath !== '/' ? configuredPath : '';
  const base = `${parsed.origin}${adminBasePath}/tenants/${encodeURIComponent(tenantId)}`;
  return {
    successUrl: `${base}?stripe_checkout=return&top_up=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}?stripe_checkout=canceled&top_up=${encodeURIComponent(orderId)}`,
  };
}

async function reserveCheckout(
  tenantId: string,
  orderId: string,
  stripeMode: StripeEnvironmentMode,
): Promise<ReservedCheckout> {
  return prisma.$transaction(async (db) => {
    const rows = await db.$queryRaw<Array<{
      id: string;
      tenantId: string;
      requestKey: string;
      status: string;
      amountCents: number;
      currency: string;
      credits: number;
      paymentProvider: string | null;
      providerPaymentId: string | null;
      stripeCheckoutSessionId: string | null;
      stripeCheckoutAttempt: number;
      stripeCheckoutExpiresAt: Date | null;
    }>>`
      SELECT
        id,
        tenant_id AS "tenantId",
        request_key AS "requestKey",
        status,
        amount_cents AS "amountCents",
        currency,
        credits,
        payment_provider AS "paymentProvider",
        provider_payment_id AS "providerPaymentId",
        stripe_checkout_session_id AS "stripeCheckoutSessionId",
        stripe_checkout_attempt AS "stripeCheckoutAttempt",
        stripe_checkout_expires_at AS "stripeCheckoutExpiresAt"
      FROM flip_ai_top_up_orders
      WHERE tenant_id = ${tenantId} AND id = ${orderId}
      FOR UPDATE
    `;
    const order = rows[0];
    if (!order) {
      throw new StripeCheckoutError(
        'STRIPE_CHECKOUT_TOP_UP_NOT_FOUND',
        404,
        'Recarga não encontrada.',
      );
    }
    if (order.status !== 'pending') {
      throw new StripeCheckoutError(
        'STRIPE_CHECKOUT_TOP_UP_NOT_PENDING',
        409,
        'Somente recargas pendentes podem abrir um Checkout Stripe.',
      );
    }
    if (order.providerPaymentId) {
      throw new StripeCheckoutError(
        'STRIPE_CHECKOUT_PAYMENT_ALREADY_LINKED',
        409,
        'Esta recarga já possui uma referência de pagamento.',
      );
    }
    if (order.paymentProvider && order.paymentProvider !== PROVIDER) {
      throw new StripeCheckoutError(
        'STRIPE_CHECKOUT_PROVIDER_CONFLICT',
        409,
        'Esta recarga já está vinculada a outro provedor.',
      );
    }
    if (order.currency.toUpperCase() !== 'BRL') {
      throw new StripeCheckoutError(
        'STRIPE_CHECKOUT_CURRENCY_NOT_ALLOWED',
        409,
        'O Checkout Stripe aceita somente recargas em BRL.',
      );
    }

    const now = new Date();
    const expectedSessionPrefix = stripeMode === 'live' ? 'cs_live_' : 'cs_test_';
    const existingUsable = Boolean(
      order.stripeCheckoutSessionId
      && order.stripeCheckoutSessionId.startsWith(expectedSessionPrefix)
      && order.stripeCheckoutExpiresAt
      && order.stripeCheckoutExpiresAt.getTime() > now.getTime() + 60_000,
    );

    if (existingUsable) {
      return {
        orderId: order.id,
        tenantId: order.tenantId,
        requestKey: order.requestKey,
        amountCents: order.amountCents,
        currency: order.currency,
        credits: order.credits,
        attempt: Math.max(1, order.stripeCheckoutAttempt),
        existingSessionId: order.stripeCheckoutSessionId,
        existingExpiresAt: order.stripeCheckoutExpiresAt,
      };
    }

    let attempt = order.stripeCheckoutAttempt;
    if (order.stripeCheckoutSessionId || attempt === 0) attempt += 1;

    await db.flipAiTopUpOrder.update({
      where: { id: order.id },
      data: {
        paymentProvider: PROVIDER,
        paymentMethod: PAYMENT_METHOD,
        stripeCheckoutAttempt: attempt,
        stripeCheckoutRequestedAt: now,
        stripeCheckoutSessionId: null,
        stripeCheckoutCreatedAt: null,
        stripeCheckoutExpiresAt: null,
      },
    });

    return {
      orderId: order.id,
      tenantId: order.tenantId,
      requestKey: order.requestKey,
      amountCents: order.amountCents,
      currency: order.currency,
      credits: order.credits,
      attempt,
      existingSessionId: null,
      existingExpiresAt: null,
    };
  });
}

function validateStripeSession(
  session: {
    id: string;
    livemode: boolean;
    status: string | null;
    payment_status: string;
    mode: string;
    url: string | null;
    amount_total: number | null;
    currency: string | null;
    client_reference_id: string | null;
    metadata: Record<string, string> | null;
  },
  order: ReservedCheckout,
  stripeMode: StripeEnvironmentMode,
) {
  const expectedLivemode = stripeMode === 'live';
  const expectedSessionPrefix = expectedLivemode ? 'cs_live_' : 'cs_test_';
  if (session.livemode !== expectedLivemode || !session.id.startsWith(expectedSessionPrefix)) {
    throw new StripeCheckoutError(
      'STRIPE_CHECKOUT_ENVIRONMENT_MISMATCH',
      502,
      'A sessão retornada não pertence ao ambiente Stripe configurado.',
    );
  }
  if (session.client_reference_id !== order.orderId) {
    throw new StripeCheckoutError(
      'STRIPE_CHECKOUT_REFERENCE_MISMATCH',
      502,
      'A sessão Stripe não corresponde à recarga solicitada.',
    );
  }
  if (
    session.mode !== 'payment'
    || session.metadata?.purpose !== 'flip_ai_top_up'
    || session.metadata?.topUpOrderId !== order.orderId
    || session.metadata?.tenantId !== order.tenantId
  ) {
    throw new StripeCheckoutError(
      'STRIPE_CHECKOUT_METADATA_MISMATCH',
      502,
      'A sessão Stripe não corresponde ao tenant e ao pedido esperados.',
    );
  }
  if (session.amount_total !== order.amountCents || session.currency?.toLowerCase() !== 'brl') {
    throw new StripeCheckoutError(
      'STRIPE_CHECKOUT_AMOUNT_MISMATCH',
      502,
      'Valor ou moeda retornados pela Stripe não correspondem à recarga.',
    );
  }
  if (session.status === 'complete' || session.payment_status === 'paid') {
    throw new StripeCheckoutError(
      'STRIPE_CHECKOUT_COMPLETED_AWAITING_VERIFICATION',
      409,
      'A sessão Stripe já foi concluída. O retorno do navegador não autoriza crédito; aguarde a verificação financeira.',
    );
  }
  if (session.status !== 'open' || !session.url) {
    throw new StripeCheckoutError(
      'STRIPE_CHECKOUT_SESSION_NOT_OPEN',
      409,
      'A sessão Stripe não está mais aberta.',
    );
  }
}

async function persistCheckoutSession(
  order: ReservedCheckout,
  session: {
    id: string;
    created: number;
    expires_at: number;
  },
  actorUserId: string,
  stripeMode: StripeEnvironmentMode,
) {
  await prisma.$transaction(async (db) => {
    const updated = await db.flipAiTopUpOrder.updateMany({
      where: {
        id: order.orderId,
        tenantId: order.tenantId,
        status: 'pending',
        stripeCheckoutAttempt: order.attempt,
        stripeCheckoutSessionId: null,
      },
      data: {
        paymentProvider: PROVIDER,
        paymentMethod: PAYMENT_METHOD,
        stripeCheckoutSessionId: session.id,
        stripeCheckoutCreatedAt: new Date(session.created * 1000),
        stripeCheckoutExpiresAt: new Date(session.expires_at * 1000),
      },
    });

    if (updated.count !== 1) {
      const current = await db.flipAiTopUpOrder.findFirst({
        where: { id: order.orderId, tenantId: order.tenantId },
        select: { stripeCheckoutSessionId: true },
      });
      if (current?.stripeCheckoutSessionId !== session.id) {
        throw new StripeCheckoutError(
          'STRIPE_CHECKOUT_RESERVATION_CONFLICT',
          409,
          'Outra tentativa de Checkout alterou esta recarga.',
        );
      }
      return;
    }

    await db.auditLog.create({
      data: {
        tenantId: order.tenantId,
        userId: actorUserId,
        entityType: 'flip_ai_top_up_order',
        entityId: order.orderId,
        action: 'platform.flip_ai_stripe_checkout_created',
        metadata: {
          stripeCheckoutSessionId: session.id,
          attempt: order.attempt,
          amountCents: order.amountCents,
          currency: 'BRL',
          credits: order.credits,
          stripeMode,
          testMode: stripeMode === 'test',
        },
      },
    });
  });
}

export async function createStripeCheckoutForTopUp(input: {
  tenantId: string;
  orderId: string;
  actorUserId: string;
}) {
  const tenantId = bounded(input.tenantId, 'tenantId');
  const orderId = bounded(input.orderId, 'orderId');
  const actorUserId = bounded(input.actorUserId, 'actorUserId');

  let stripe;
  let stripeConfig;
  try {
    stripeConfig = requireStripeConfiguration();
    stripe = getStripeClient();
  } catch (error) {
    if (error instanceof StripeFoundationConfigError) {
      throw new StripeCheckoutError(error.code, 503, error.message);
    }
    throw error;
  }

  let reserved = await reserveCheckout(tenantId, orderId, stripeConfig.mode);

  if (reserved.existingSessionId) {
    const existing = await stripe.checkout.sessions.retrieve(reserved.existingSessionId);
    try {
      validateStripeSession(existing, reserved, stripeConfig.mode);
      return {
        checkoutUrl: existing.url!,
        sessionId: existing.id,
        expiresAt: new Date(existing.expires_at * 1000).toISOString(),
        reused: true,
        stripeMode: stripeConfig.mode,
        testMode: stripeConfig.mode === 'test',
      };
    } catch (error) {
      if (!(error instanceof StripeCheckoutError)
        || error.code !== 'STRIPE_CHECKOUT_SESSION_NOT_OPEN') {
        throw error;
      }
      await prisma.flipAiTopUpOrder.updateMany({
        where: {
          id: reserved.orderId,
          tenantId: reserved.tenantId,
          status: 'pending',
          stripeCheckoutSessionId: existing.id,
        },
        data: { stripeCheckoutExpiresAt: new Date(0) },
      });
      reserved = await reserveCheckout(tenantId, orderId, stripeConfig.mode);
    }
  }

  const urls = checkoutReturnUrls(tenantId, orderId);
  const idempotencyKey = `flip-ai-top-up:${orderId}:checkout:${reserved.attempt}`;
  const metadata = {
    purpose: 'flip_ai_top_up',
    topUpOrderId: orderId,
    tenantId,
  };

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    ui_mode: 'hosted_page',
    client_reference_id: orderId,
    success_url: urls.successUrl,
    cancel_url: urls.cancelUrl,
    payment_method_types: ['card'],
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'brl',
        unit_amount: reserved.amountCents,
        product_data: {
          name: `Flip AI — ${reserved.credits.toLocaleString('pt-BR')} créditos`,
          description: stripeConfig.mode === 'test' ? 'Recarga de créditos Flip AI em ambiente de teste.' : 'Recarga de créditos Flip AI.'
        },
      },
    }],
    metadata,
    payment_intent_data: { metadata },
  }, {
    idempotencyKey,
  });

  validateStripeSession(session, reserved, stripeConfig.mode);
  await persistCheckoutSession(reserved, session, actorUserId, stripeConfig.mode);

  return {
    checkoutUrl: session.url!,
    sessionId: session.id,
    expiresAt: new Date(session.expires_at * 1000).toISOString(),
    reused: false,
    stripeMode: stripeConfig.mode,
    testMode: stripeConfig.mode === 'test',
  };
}
