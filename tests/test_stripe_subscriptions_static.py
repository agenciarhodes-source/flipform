from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_public_checkout_uses_stripe_only_behind_the_flag():
    route = read("app/api/public/checkout/route.ts")
    assert "if (!stripeSubscriptionsEnabled()) {" in route
    assert "asaas" not in route.lower()


def test_card_goes_to_stripe_page_and_pix_boleto_to_monthly_invoices_with_trial():
    checkout = read("lib/stripe/subscription-checkout.ts")
    assert "mode: 'subscription'" in checkout
    assert "payment_method_types: ['card']" in checkout
    assert "collection_method: 'send_invoice'" in checkout
    assert "payment_method_types: ['pix', 'boleto', 'card']" in checkout
    assert checkout.count("trial_period_days: TRIAL_DAYS") == 2
    assert "requireStripeCheckoutConfiguration()" in checkout
    rules = read("lib/billing/subscription-rules.ts")
    assert "export const TRIAL_DAYS = 7;" in rules


def test_webhook_routes_subscription_events_before_the_credit_top_ups():
    route = read("app/api/webhooks/stripe/route.ts")
    assert route.index("isStripeSubscriptionEvent(event)") < route.index("retrieveVerifiedStripeTopUpPayment(event)")
    webhook = read("lib/stripe/subscription-webhook.ts")
    assert "object?.mode === 'subscription' && object?.metadata?.purpose === SUBSCRIPTION_PURPOSE" in webhook
    assert "provider_eventId: { provider: 'stripe', eventId: event.id }" in webhook
    assert "event.livemode !== (config.mode === 'live')" in webhook
    # Courtesy plans are never changed by Stripe events.
    assert "if (row.status === 'courtesy') return;" in webhook


def test_checkout_page_shows_the_prices_that_are_charged():
    page = read("app/checkout/[planSlug]/page.tsx")
    assert "prisma.plan.findMany(" in page
    client = read("app/checkout/[planSlug]/checkout-client.tsx")
    assert "priceNumber: 97" not in client
    assert "Cupom aplicado! (10% off)" not in client
    assert "(sem juros)" not in client
    assert ".filter(isSellablePlan)" in page


def test_every_active_paid_plan_is_sold_and_pricing_reads_the_plans_table():
    route = read("app/api/public/checkout/route.ts")
    assert "PUBLIC_PLAN_SLUGS" not in route
    assert route.count("!isSellablePlan(plan)") == 1
    pricing = read("app/pricing/page.tsx")
    assert "prisma.plan.findMany(" in pricing
    assert "R$ 97/mês" not in pricing
    assert "Inclui o atendente de IA" in pricing
