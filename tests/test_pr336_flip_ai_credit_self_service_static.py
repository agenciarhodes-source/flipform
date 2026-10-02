from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr336_credit_packages_are_server_authoritative_and_hide_internal_cost():
    catalog = read("lib/flip-ai/credit-packages.ts")
    checkout = read("lib/flip-ai/self-service-credits.ts")
    route = read("app/api/flip-ai/credits/checkout/route.ts")

    assert "import 'server-only'" in catalog
    assert "FLIP_AI_CREDIT_PACKAGES_JSON" in catalog
    assert "estimatedOpenAiCostCents" in catalog
    assert "getPublicFlipAiCreditPackages" in catalog
    public_segment = catalog.split("export function getPublicFlipAiCreditPackages", 1)[1].split(
        "export function requireFlipAiCreditPackage", 1
    )[0]
    assert "estimatedOpenAiCostCents:" not in public_segment

    assert "selectedPackage.amountCents" in checkout
    assert "selectedPackage.credits" in checkout
    assert "selectedPackage.estimatedOpenAiCostCents" in checkout

    # Browser chooses only a package identifier + idempotency key.
    assert "packageId" in route
    assert "requestKey" in route
    assert "amountCents" not in route
    assert "credits" not in route
    assert "estimatedOpenAiCostCents" not in route


def test_pr336_self_service_is_tenant_scoped_owner_admin_and_live_only():
    service = read("lib/flip-ai/self-service-credits.ts")
    route = read("app/api/flip-ai/credits/checkout/route.ts")

    assert "withPermission('FLIP_AI_MANAGE'" in route
    assert "['owner', 'admin'].includes(session.role)" in service
    assert "requireFlipAiAccess" in service
    assert "tenantId: access.tenantId" in service
    assert "actorUserId: access.userId" in service
    assert "stripe.mode !== 'live'" in service
    assert "stripe.readyForCheckout" in service
    assert "tenant_self_service" in service


def test_pr336_customer_checkout_returns_to_app_not_platform_admin():
    stripe = read("lib/stripe/top-up-checkout.ts")

    assert "'NEXT_PUBLIC_APP_URL'" in stripe
    assert "returnTarget === 'tenant_self_service'" in stripe
    assert "/flip-ai/credits" in stripe
    assert "returnTarget?: StripeCheckoutReturnTarget" in stripe
    assert "actorScope?: StripeCheckoutActorScope" in stripe
    assert "tenant.flip_ai_stripe_checkout_created" in stripe


def test_pr336_browser_return_never_credits_wallet():
    page = read("components/flip-ai/credit-wallet-client.tsx")
    checkout_route = read("app/api/flip-ai/credits/checkout/route.ts")
    webhook = read("lib/stripe/top-up-webhook.ts")

    assert "stripe_checkout" in page
    assert "recordFlipAiCreditEntryWithDb" not in page
    assert "recordFlipAiCreditEntryWithDb" not in checkout_route
    assert "recordFlipAiCreditEntryWithDb" in webhook
    assert "provider_eventId" in webhook
    assert "FOR UPDATE" in webhook


def test_pr336_customer_wallet_exposes_purchase_and_history_without_admin_fields():
    page = read("app/(app)/flip-ai/credits/page.tsx")
    client = read("components/flip-ai/credit-wallet-client.tsx")
    api = read("app/api/flip-ai/credits/route.ts")
    service = read("lib/flip-ai/self-service-credits.ts")

    assert "Carteira Flip AI" in page
    assert "/api/flip-ai/credits/checkout" in client
    assert "Comprar créditos" in client
    assert "Recargas recentes" in client
    assert "Histórico de consumo" in client
    assert "Cache-Control" in api
    assert "estimatedOpenAiCostCents" not in service.split("function publicOrder", 1)[1].split(
        "async function requireTenantSelfServiceAccess", 1
    )[0]


def test_pr336_checkout_request_is_idempotent_and_rate_limited():
    route = read("app/api/flip-ai/credits/checkout/route.ts")
    topups = read("lib/flip-ai/top-ups.ts")
    stripe = read("lib/stripe/top-up-checkout.ts")

    assert "z.string().uuid()" in route
    assert "rateLimit" in route
    assert "tenantId_requestKey" in topups
    assert "idempotencyKey = \`flip-ai-top-up:\${orderId}:checkout:\${reserved.attempt}\`" in stripe
