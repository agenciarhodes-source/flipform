from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr331_pins_official_stripe_server_sdk():
    package = json.loads(read("package.json"))
    lock = json.loads(read("package-lock.json"))

    assert package["dependencies"]["stripe"] == "22.6.2"
    stripe_lock = lock["packages"]["node_modules/stripe"]
    assert stripe_lock["version"] == "22.6.2"
    assert stripe_lock["integrity"] == "sha512-PwRE2scocvXqDKPiskMa5vRJEAEkq46W69XyUYmAwrNSLr675lQnfqLwnsndAWizwgihOWw/irLmoFRo3ez7ew=="


def test_pr331_is_server_only_test_only_and_live_is_hard_blocked():
    config = read("lib/stripe/config.ts")
    client = read("lib/stripe/client.ts")

    assert "import 'server-only'" in config
    assert "import 'server-only'" in client
    assert "STRIPE_FOUNDATION_LIVE_PAYMENTS_ALLOWED = false" in config
    assert "rk_test_" in config
    assert "rk_live_" in config
    assert "requireStripeTestConfiguration" in client
    assert "maxNetworkRetries: 0" in client
    assert "telemetry: false" in client
    assert "process.env.STRIPE_RESTRICTED_KEY" not in client


def test_pr331_readiness_is_platform_admin_only_and_never_returns_secrets():
    route = read("app/api/admin/integrations/stripe/readiness/route.ts")
    card = read("app/admin/(secure)/integrations/stripe-foundation-readiness-card.tsx")

    assert "withPlatformAdmin" in route
    assert "private, no-store" in route
    assert "checkoutCreationEnabled: false" in route
    assert "webhookProcessingEnabled: false" in route
    assert "moneyMovementEnabled: false" in route
    assert "STRIPE_RESTRICTED_KEY" not in route
    assert "STRIPE_WEBHOOK_SECRET" not in route
    assert 'type="password"' not in card
    assert "Nenhuma chave Stripe é retornada" in card


def test_pr331_environment_guard_requires_restricted_test_key_when_enabled():
    validator = read("lib/config/validate-env.ts")
    env_example = read(".env.example")
    env_prod = read(".env.production.example")

    assert "STRIPE_ENABLED" in validator
    assert "stripeRestrictedKey.startsWith('rk_test_')" in validator
    assert "STRIPE_LIVE_PAYMENTS_ALLOWED must remain false" in validator
    assert "STRIPE_ENABLED=false" in env_example
    assert "STRIPE_MODE=test" in env_example
    assert "STRIPE_LIVE_PAYMENTS_ALLOWED=false" in env_example
    assert "STRIPE_RESTRICTED_KEY=\n" in env_example
    assert "STRIPE_RESTRICTED_KEY=\n" in env_prod


def test_pr331_does_not_create_checkout_payment_intent_or_money_movement():
    paths = [
        "lib/stripe/config.ts",
        "lib/stripe/client.ts",
        "app/api/admin/integrations/stripe/readiness/route.ts",
        "app/admin/(secure)/integrations/stripe-foundation-readiness-card.tsx",
    ]
    combined = "\n".join(read(path) for path in paths).lower()

    for forbidden in [
        "checkout.sessions.create",
        "paymentintents.create",
        "refunds.create",
        "payouts.create",
        "transfers.create",
    ]:
        assert forbidden not in combined


def test_repository_contains_no_committed_stripe_secret_material():
    secret_patterns = [
        re.compile(r"sk_live_[A-Za-z0-9]{20,}"),
        re.compile(r"rk_live_[A-Za-z0-9]{20,}"),
        re.compile(r"sk_test_[A-Za-z0-9]{20,}"),
        re.compile(r"rk_test_[A-Za-z0-9]{20,}"),
        re.compile(r"whsec_[A-Za-z0-9]{20,}"),
    ]
    excluded_dirs = {".git", "node_modules", ".next", "coverage"}

    for path in ROOT.rglob("*"):
        if not path.is_file() or any(part in excluded_dirs for part in path.parts):
            continue
        if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip", ".lockb"}:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for pattern in secret_patterns:
            assert pattern.search(content) is None, f"possible Stripe secret committed in {path.relative_to(ROOT)}"
