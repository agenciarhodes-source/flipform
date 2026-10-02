import 'server-only';

import { prisma } from '@/lib/prisma';
import type { SessionPayload } from '@/lib/auth';
import { FlipAiError, requireFlipAiAccess } from './access';
import { getFlipAiCreditWallet } from './credits';
import {
  getPublicFlipAiCreditPackages,
  requireFlipAiCreditPackage,
} from './credit-packages';
import {
  createFlipAiTopUpOrder,
  listFlipAiTopUpOrdersForTenant,
} from './top-ups';
import { inspectStripeFoundationConfiguration } from '@/lib/stripe/config';
import {
  createStripeCheckoutForTopUp,
  StripeCheckoutError,
} from '@/lib/stripe/top-up-checkout';

function publicOrder(order: Awaited<ReturnType<typeof listFlipAiTopUpOrdersForTenant>>['orders'][number]) {
  return {
    id: order.id,
    status: order.status,
    amountCents: order.amountCents,
    currency: order.currency,
    credits: order.credits,
    paymentProvider: order.paymentProvider,
    paidAt: order.paidAt,
    creditedAt: order.creditedAt,
    canceledAt: order.canceledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

async function requireTenantSelfServiceAccess(session: SessionPayload) {
  if (!['owner', 'admin'].includes(session.role)) {
    throw new FlipAiError(
      'FLIP_AI_CREDIT_PURCHASE_FORBIDDEN',
      403,
      'Somente o dono ou um administrador pode comprar créditos Flip AI.',
    );
  }
  return prisma.$transaction((db) => requireFlipAiAccess(db, session));
}

export async function getFlipAiCreditStorefront(session: SessionPayload) {
  const access = await requireTenantSelfServiceAccess(session);
  const [wallet, topUps] = await Promise.all([
    getFlipAiCreditWallet(session, 100),
    listFlipAiTopUpOrdersForTenant(access.tenantId, 30),
  ]);
  const packages = getPublicFlipAiCreditPackages();
  const stripe = inspectStripeFoundationConfiguration();
  const purchaseReason: 'catalog_not_configured' | 'live_not_enabled' | 'stripe_not_ready' | null =
    packages.length === 0
      ? 'catalog_not_configured'
      : stripe.mode !== 'live'
        ? 'live_not_enabled'
        : !stripe.readyForCheckout
          ? 'stripe_not_ready'
          : null;

  return {
    wallet,
    packages,
    orders: topUps.orders.map(publicOrder),
    purchases: {
      available: purchaseReason === null,
      reason: purchaseReason,
    },
  };
}

export async function createFlipAiSelfServiceCheckout(input: {
  session: SessionPayload;
  packageId: string;
  requestKey: string;
}) {
  const access = await requireTenantSelfServiceAccess(input.session);
  const stripe = inspectStripeFoundationConfiguration();
  if (stripe.mode !== 'live' || !stripe.readyForCheckout) {
    throw new FlipAiError(
      'FLIP_AI_CREDIT_PURCHASE_UNAVAILABLE',
      503,
      'A compra automática de créditos ainda não está disponível.',
    );
  }

  const selectedPackage = requireFlipAiCreditPackage(input.packageId);
  const serverRequestKey = `tenant-self:${selectedPackage.id}:${input.requestKey}`;
  const created = await createFlipAiTopUpOrder({
    tenantId: access.tenantId,
    requestKey: serverRequestKey,
    amountCents: selectedPackage.amountCents,
    credits: selectedPackage.credits,
    estimatedOpenAiCostCents: selectedPackage.estimatedOpenAiCostCents,
    actorUserId: access.userId,
    origin: 'tenant_self_service',
  });

  try {
    const checkout = await createStripeCheckoutForTopUp({
      tenantId: access.tenantId,
      orderId: created.order.id,
      actorUserId: access.userId,
      returnTarget: 'tenant_self_service',
      actorScope: 'tenant_self_service',
    });

    return {
      order: publicOrder(created.order),
      checkoutUrl: checkout.checkoutUrl,
      expiresAt: checkout.expiresAt,
      reused: created.reused || checkout.reused,
    };
  } catch (error) {
    if (error instanceof StripeCheckoutError) throw error;
    throw error;
  }
}
