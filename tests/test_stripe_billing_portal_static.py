from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_owner_manages_card_and_invoices_on_the_stripe_portal():
    route = read("app/api/billing/portal/route.ts")
    assert "withPermission('BILLING_MANAGE'" in route
    assert "createBillingPortalUrl(session.tenantId," in route
    manage = read("lib/stripe/subscription-manage.ts")
    assert "billingPortal.sessions.create(" in manage
    assert "provider: 'stripe'" in manage


def test_plan_change_and_cancel_go_through_stripe():
    change = read("app/api/billing/change-plan/route.ts")
    assert "changeStripeSubscriptionPlan(session.tenantId," in change
    assert change.index("changeStripeSubscriptionPlan(") < change.index("prisma.subscription.update(")
    assert "isSellablePlan(targetPlan)" in change
    assert "SELF_SERVE" not in change
    manage = read("lib/stripe/subscription-manage.ts")
    assert "proration_behavior: 'create_prorations'" in manage
    assert "cancel_at_period_end: true" in manage
    cancel = read("app/api/billing/cancel/route.ts")
    assert "cancelStripeSubscriptionAtPeriodEnd(session.tenantId)" in cancel
    assert "@/lib/asaas" not in cancel


def test_asaas_is_no_longer_required():
    env = read("lib/config/validate-env.ts")
    assert "if (asaasConfigured) {" in env
    readiness = read("app/api/health/readiness/route.ts")
    assert "asaasConfig" not in readiness
    assert "checks.billingConfig" in readiness


def test_billing_page_shows_the_stripe_tools_only_for_stripe_subscriptions():
    page = read("app/(app)/billing/page.tsx")
    assert "{isStripe && <BillingPortalClient />}" in page
    assert "selfServe={isStripe}" in page
    assert "plans={sellablePlans}" in page
