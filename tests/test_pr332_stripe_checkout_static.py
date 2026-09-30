from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr332_migration_is_additive_and_reserves_checkout_idempotently():
    sql = read("prisma/migrations/20260930233000_flip_ai_stripe_test_checkout/migration.sql")

    assert 'ALTER TABLE "flip_ai_top_up_orders"' in sql
    assert '"stripe_checkout_session_id" TEXT' in sql
    assert '"stripe_checkout_attempt" INTEGER NOT NULL DEFAULT 0' in sql
    assert '"stripe_checkout_requested_at" TIMESTAMP(3)' in sql
    assert '"stripe_checkout_created_at" TIMESTAMP(3)' in sql
    assert '"stripe_checkout_expires_at" TIMESTAMP(3)' in sql
    assert 'CHECK ("stripe_checkout_attempt" >= 0)' in sql
    assert 'flip_ai_top_up_orders_stripe_checkout_session_id_key' in sql

    for token in ["DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM"]:
        assert token.lower() not in sql.lower()


def test_pr332_checkout_is_admin_only_test_only_and_server_authoritative():
    route = read("app/api/admin/tenants/[id]/flip-ai-top-ups/[orderId]/stripe-checkout/route.ts")
    checkout = read("lib/stripe/top-up-checkout.ts")

    assert "withPlatformAdmin" in route
    assert "rateLimit" in route
    assert "import 'server-only'" in checkout
    assert "getStripeTestClient()" in checkout
    assert "mode: 'payment'" in checkout
    assert "ui_mode: 'hosted'" in checkout
    assert "payment_method_types: ['card']" in checkout
    assert "unit_amount: reserved.amountCents" in checkout
    assert "client_reference_id: orderId" in checkout
    assert "topUpOrderId: orderId" in checkout
    assert "tenantId" in checkout
    assert "payment_intent_data: { metadata }" in checkout
    assert "idempotencyKey" in checkout
    assert "stripeCheckoutAttempt" in checkout
    assert "cs_test_" in checkout
    assert "session.livemode" in checkout


def test_pr332_browser_cannot_submit_price_or_credit_quantity_to_checkout_route():
    route = read("app/api/admin/tenants/[id]/flip-ai-top-ups/[orderId]/stripe-checkout/route.ts")
    page = read("app/admin/(secure)/tenants/[id]/page.tsx")

    assert "amountCents" not in route
    assert "credits" not in route
    assert "estimatedOpenAiCostCents" not in route
    assert "body: JSON.stringify" not in page.split("openStripeTestCheckout", 1)[1].split("const saveUserRole", 1)[0]


def test_pr332_checkout_never_marks_paid_or_credits_wallet():
    checkout = read("lib/stripe/top-up-checkout.ts")
    topups = read("lib/flip-ai/top-ups.ts")

    assert "markFlipAiTopUpPaid" not in checkout
    assert "creditFlipAiTopUpOrder" not in checkout
    assert "recordFlipAiCreditEntry" not in checkout
    assert "balanceCredits" not in checkout
    assert "FLIP_AI_TOP_UP_STRIPE_PAYMENT_REQUIRES_VERIFICATION" in topups
    assert "Recargas vinculadas à Stripe não podem ser marcadas como pagas manualmente." in topups


def test_pr332_return_url_is_navigation_only_not_payment_authority():
    checkout = read("lib/stripe/top-up-checkout.ts")
    page = read("app/admin/(secure)/tenants/[id]/page.tsx")

    assert "session_id={CHECKOUT_SESSION_ID}" in checkout
    assert "stripe_checkout=test_return" in checkout
    assert "Retornar da Stripe não confirma pagamento e não libera créditos." in page
    assert "stripe_checkout=test_return" not in page


def test_pr332_does_not_add_webhook_or_live_payment_processing():
    checkout = read("lib/stripe/top-up-checkout.ts")
    readiness = read("app/api/admin/integrations/stripe/readiness/route.ts")

    assert "webhookProcessingEnabled: false" in readiness
    assert "moneyMovementEnabled: false" in readiness
    assert "STRIPE_FOUNDATION_LIVE_PAYMENTS_ALLOWED" in readiness

    for forbidden in [
        "webhooks.constructevent",
        "refunds.create",
        "payouts.create",
        "transfers.create",
        "rk_live_",
        "sk_live_",
    ]:
        assert forbidden not in checkout.lower()
