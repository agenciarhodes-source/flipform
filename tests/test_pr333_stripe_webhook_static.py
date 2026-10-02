from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr333_webhook_requires_raw_body_and_stripe_signature():
    route = read("app/api/webhooks/stripe/route.ts")
    assert "req.headers.get('stripe-signature')" in route
    assert "await req.text()" in route
    assert "webhooks.constructEvent(rawBody, signature, webhookSecret)" in route
    assert "requireStripeWebhookSecret()" in route
    assert "MAX_WEBHOOK_BYTES" in route
    assert "rateLimit" in route


def test_pr333_verifies_checkout_and_payment_intent_server_to_server():
    webhook = read("lib/stripe/top-up-webhook.ts")
    assert "stripe.checkout.sessions.retrieve(sessionId)" in webhook
    assert "stripe.paymentIntents.retrieve(paymentIntentId)" in webhook
    assert "session.status !== 'complete'" in webhook
    assert "session.payment_status !== 'paid'" in webhook
    assert "paymentIntent.status !== 'succeeded'" in webhook
    assert "paymentIntent.amount_received !== session.amount_total" in webhook
    assert "session.client_reference_id !== orderId" in webhook
    assert "STRIPE_WEBHOOK_LIVE_EVENT_BLOCKED" in webhook


def test_pr333_binds_tenant_order_session_amount_and_currency_before_credit():
    webhook = read("lib/stripe/top-up-webhook.ts")
    for token in [
        "order.stripeCheckoutSessionId !== input.sessionId",
        "order.amountCents !== input.amountCents",
        "order.currency.toUpperCase() !== input.currency.toUpperCase()",
        "order.providerPaymentId && order.providerPaymentId !== input.paymentIntentId",
        "metadataValue(paymentIntent.metadata, 'tenantId') !== tenantId",
        "metadataValue(paymentIntent.metadata, 'topUpOrderId') !== orderId",
    ]:
        assert token in webhook


def test_pr333_replay_and_double_credit_are_idempotent():
    webhook = read("lib/stripe/top-up-webhook.ts")
    assert "provider_eventId" in webhook
    assert "FOR UPDATE" in webhook
    assert "if (webhook.processedAt)" in webhook
    assert "idempotencyKey:" in webhook
    assert "top-up:" in webhook
    assert "recordFlipAiCreditEntryWithDb" in webhook
    assert "processedAt: now" in webhook


def test_pr333_remains_test_only_and_does_not_add_refunds_or_live_money_movement():
    route = read("app/api/webhooks/stripe/route.ts")
    webhook = read("lib/stripe/top-up-webhook.ts").lower()
    readiness = read("app/api/admin/integrations/stripe/readiness/route.ts")
    assert "webhookProcessingEnabled: readiness.readyForWebhookValidation" in readiness
    assert "moneyMovementEnabled: false" in readiness
    assert "getStripeTestClient" in route
    for forbidden in [
        "refunds.create",
        "payouts.create",
        "transfers.create",
        "rk_live_",
        "sk_live_",
    ]:
        assert forbidden not in webhook
