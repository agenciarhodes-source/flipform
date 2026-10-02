import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { createFlipAiTopUpOrder } from '../lib/flip-ai/top-ups';
import { getFlipAiCreditWalletForTenant } from '../lib/flip-ai/credits';
import { applyVerifiedStripeTopUpPayment, StripeTopUpWebhookError } from '../lib/stripe/top-up-webhook';

function assertDisposableDatabase() {
  const url = new URL(process.env.DATABASE_URL || 'https://invalid');
  if (process.env.CI !== 'true' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/flipform_ci') {
    throw new Error('Stripe webhook fixtures require CI=true and local disposable flipform_ci database.');
  }
}

async function fixture() {
  const suffix = randomUUID();
  const plan = await prisma.plan.upsert({
    where: { slug: 'premium' },
    update: {},
    create: { name: 'Premium CI', slug: 'premium', price: 797 },
  });
  const user = await prisma.user.create({
    data: { name: 'Stripe CI', email: suffix + '@example.invalid', passwordHash: 'unused' },
  });
  const tenant = await prisma.tenant.create({
    data: { name: 'Stripe CI', slug: 'stripe-ci-' + suffix, planId: plan.id, status: 'active' },
  });
  await prisma.tenantUser.create({
    data: { tenantId: tenant.id, userId: user.id, role: 'owner' },
  });
  return { tenant, user };
}

async function cleanup(x: Awaited<ReturnType<typeof fixture>>) {
  await prisma.webhookEvent.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.flipAiTopUpOrder.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.flipAiCreditLedgerEntry.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.flipAiCreditAccount.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.tenantUser.deleteMany({ where: { tenantId: x.tenant.id } });
  await prisma.tenant.delete({ where: { id: x.tenant.id } });
  await prisma.user.delete({ where: { id: x.user.id } });
}

test('verified Stripe payment credits one tenant exactly once', async () => {
  assertDisposableDatabase();
  const x = await fixture();
  try {
    const created = await createFlipAiTopUpOrder({
      tenantId: x.tenant.id,
      requestKey: 'stripe-webhook-ci:' + randomUUID(),
      amountCents: 19990,
      credits: 100000,
      estimatedOpenAiCostCents: 890,
      actorUserId: x.user.id,
    });
    const sessionId = 'cs_test_' + randomUUID().replaceAll('-', '');
    const paymentIntentId = 'pi_' + randomUUID().replaceAll('-', '');

    await prisma.flipAiTopUpOrder.update({
      where: { id: created.order.id },
      data: {
        paymentProvider: 'stripe',
        paymentMethod: 'card_test_checkout',
        stripeCheckoutAttempt: 1,
        stripeCheckoutSessionId: sessionId,
        stripeCheckoutCreatedAt: new Date(),
        stripeCheckoutExpiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });

    const verified = {
      eventId: 'evt_test_' + randomUUID().replaceAll('-', ''),
      eventType: 'checkout.session.completed',
      sessionId,
      paymentIntentId,
      tenantId: x.tenant.id,
      orderId: created.order.id,
      amountCents: 19990,
      currency: 'BRL',
      paymentMethod: 'card',
      eventCreatedAt: new Date(),
      stripeMode: 'test',
    };

    const first = await applyVerifiedStripeTopUpPayment(verified);
    assert.equal(first.status, 'credited');
    assert.equal(first.balanceCredits, 100000);
    assert.equal((await getFlipAiCreditWalletForTenant(x.tenant.id)).balanceCredits, 100000);

    const replay = await applyVerifiedStripeTopUpPayment(verified);
    assert.equal(replay.reused, true);
    assert.equal((await getFlipAiCreditWalletForTenant(x.tenant.id)).balanceCredits, 100000);
    assert.equal(await prisma.flipAiCreditLedgerEntry.count({
      where: {
        tenantId: x.tenant.id,
        idempotencyKey: 'top-up:' + created.order.id,
      },
    }), 1);
    assert.equal(await prisma.webhookEvent.count({
      where: {
        provider: 'stripe',
        eventId: verified.eventId,
        processedAt: { not: null },
      },
    }), 1);
  } finally {
    await cleanup(x);
  }
});

test('verified Stripe payment rejects mismatched amount without crediting wallet', async () => {
  assertDisposableDatabase();
  const x = await fixture();
  try {
    const created = await createFlipAiTopUpOrder({
      tenantId: x.tenant.id,
      requestKey: 'stripe-mismatch-ci:' + randomUUID(),
      amountCents: 9900,
      credits: 40000,
      estimatedOpenAiCostCents: 300,
      actorUserId: x.user.id,
    });
    const sessionId = 'cs_test_' + randomUUID().replaceAll('-', '');

    await prisma.flipAiTopUpOrder.update({
      where: { id: created.order.id },
      data: {
        paymentProvider: 'stripe',
        paymentMethod: 'card_test_checkout',
        stripeCheckoutAttempt: 1,
        stripeCheckoutSessionId: sessionId,
        stripeCheckoutCreatedAt: new Date(),
        stripeCheckoutExpiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });

    await assert.rejects(
      applyVerifiedStripeTopUpPayment({
        eventId: 'evt_test_' + randomUUID().replaceAll('-', ''),
        eventType: 'checkout.session.completed',
        sessionId,
        paymentIntentId: 'pi_' + randomUUID().replaceAll('-', ''),
        tenantId: x.tenant.id,
        orderId: created.order.id,
        amountCents: 9901,
        currency: 'BRL',
        paymentMethod: 'card',
        eventCreatedAt: new Date(),
      stripeMode: 'test',
      }),
      (error: unknown) => error instanceof StripeTopUpWebhookError
        && error.code === 'STRIPE_WEBHOOK_ORDER_MISMATCH',
    );
    assert.equal((await getFlipAiCreditWalletForTenant(x.tenant.id)).balanceCredits, 0);
    assert.equal(await prisma.flipAiCreditLedgerEntry.count({ where: { tenantId: x.tenant.id } }), 0);
  } finally {
    await cleanup(x);
  }
});
