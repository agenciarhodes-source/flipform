from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr335_live_requires_live_key_and_explicit_hard_gate():
    config = read("lib/stripe/config.ts")
    validator = read("lib/config/validate-env.ts")

    assert "mode === 'live' && keyKind === 'live' && livePaymentsAllowed" in config
    assert "STRIPE_MODE=live exige uma Restricted API Key rk_live_." in config
    assert "Pagamentos live exigem STRIPE_LIVE_PAYMENTS_ALLOWED=true." in config
    assert "stripeMode === 'live'" in validator
    assert "stripeRestrictedKey.startsWith('rk_live_')" in validator
    assert "Stripe live checkout hard gate disabled; webhook settlement remains available" in validator
    assert "STRIPE_MODE=live requires STRIPE_WEBHOOK_SECRET before accepting real payments." in validator
    assert "STRIPE_MODE=live exige STRIPE_WEBHOOK_SECRET configurado antes de aceitar pagamentos reais." in config
    assert "Novos Checkouts live estão bloqueados por STRIPE_LIVE_PAYMENTS_ALLOWED=false." in config


def test_pr335_checkout_and_webhook_require_environment_match():
    checkout = read("lib/stripe/top-up-checkout.ts")
    webhook = read("lib/stripe/top-up-webhook.ts")

    assert "expectedSessionPrefix = expectedLivemode ? 'cs_live_' : 'cs_test_'" in checkout
    assert "session.livemode !== expectedLivemode" in checkout
    assert "expectedSessionPrefix = stripeConfig.mode === 'live' ? 'cs_live_' : 'cs_test_'" in webhook
    assert "event.livemode !== expectedLivemode" in webhook
    assert "session.livemode !== expectedLivemode" in webhook
    assert "paymentIntent.livemode !== expectedLivemode" in webhook


def test_pr335_live_does_not_move_credit_authority_to_browser():
    checkout = read("lib/stripe/top-up-checkout.ts")
    webhook = read("lib/stripe/top-up-webhook.ts")

    assert "recordFlipAiCreditEntryWithDb" not in checkout
    assert "recordFlipAiCreditEntryWithDb" in webhook
    assert "provider_eventId" in webhook
    assert "FOR UPDATE" in webhook
    assert "idempotencyKey: `top-up:${order.id}`" in webhook


def test_pr335_admin_readiness_exposes_commercial_state_without_secrets():
    route = read("app/api/admin/integrations/stripe/readiness/route.ts")

    assert "commercialPaymentsEnabled: readiness.readyForCheckout && readiness.mode === 'live'" in route
    assert "STRIPE_RESTRICTED_KEY" not in route
    assert "STRIPE_WEBHOOK_SECRET" not in route


def test_pr335_live_kill_switch_blocks_new_checkout_but_keeps_webhook_settlement_ready():
    config = read("lib/stripe/config.ts")
    checkout = read("lib/stripe/top-up-checkout.ts")
    webhook_route = read("app/api/webhooks/stripe/route.ts")

    assert "requireStripeCheckoutConfiguration" in checkout
    assert "requireStripeConfiguration" in config
    assert "readyForWebhookValidation: environmentReady && webhookValid" in config
    assert "readyForCheckout: environmentReady" in config
    assert "mode === 'test' || livePaymentsAllowed" in config
    assert "getStripeClient().webhooks.constructEvent" in webhook_route
