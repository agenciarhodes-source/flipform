from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr339_treasury_endpoint_is_platform_admin_only_and_read_only():
    route = read("app/api/admin/flip-ai/treasury/route.ts")
    treasury = read("lib/flip-ai/treasury.ts")
    assert "withPlatformAdmin" in route
    assert "getFlipAiTreasuryDashboard" in route
    assert "Cache-Control" in route
    for forbidden in [
        "prisma.flipAiCreditAccount.update",
        "prisma.flipAiTopUpOrder.update",
        "prisma.tenant.update",
        "recordFlipAiCreditEntry",
        "ALTER TABLE",
        "CREATE TABLE",
        "DROP TABLE",
        "DELETE FROM",
    ]:
        assert forbidden not in route
        assert forbidden not in treasury


def test_pr339_liability_uses_outstanding_tenant_wallet_balances():
    treasury = read("lib/flip-ai/treasury.ts")
    policy = read("lib/flip-ai/treasury-policy.ts")
    assert "FROM flip_ai_credit_accounts" in treasury
    assert "a.balance_credits > 0" in treasury
    assert "creditsInCirculation" in treasury
    assert "reserveUsdPerMillionCredits" in policy
    assert "estimatedOpenAiCostCents" in policy
    assert "sort((left, right) => right.reserveUsdPerMillion - left.reserveUsdPerMillion)" in policy


def test_pr339_treasury_exposes_coverage_without_provider_secrets():
    page = read("app/admin/(secure)/treasury/page.tsx")
    route = read("app/api/admin/flip-ai/treasury/route.ts")
    assert "Tesouraria IA" in page
    assert "Obrigação de IA" in page
    assert "Reserva recomendada" in page
    assert "Recarga recomendada agora" in page
    assert "Cobertura da obrigação" in page
    assert "Gasto OpenAI — 30 dias" in page
    assert "Maiores obrigações por cliente" in page
    assert "OPENAI_API_KEY" not in page
    assert "OPENAI_ADMIN_KEY" not in page
    assert "adminKey" not in route


def test_pr339_openai_balance_limitation_is_explicit_and_auto_reload_is_external():
    treasury = read("lib/flip-ai/treasury.ts")
    page = read("app/admin/(secure)/treasury/page.tsx")
    assert "balanceEndpointAvailable: false" in treasury
    assert "autoReloadManagedExternally: true" in treasury
    assert "manual_server_configuration" in treasury
    assert "auto-reload" in page
    assert "não existe endpoint oficial de saldo/recarga" in page


def test_pr339_buffer_is_server_side_and_documented():
    treasury = read("lib/flip-ai/treasury.ts")
    policy = read("lib/flip-ai/treasury-policy.ts")
    env = read(".env.example")
    prod = read(".env.production.example")
    assert "process.env.FLIP_AI_TREASURY_BUFFER_PERCENT" in treasury
    assert "resolveTreasuryBufferPercent" in policy
    assert "FLIP_AI_TREASURY_BUFFER_PERCENT=20" in env
    assert "FLIP_AI_TREASURY_BUFFER_PERCENT=20" in prod
    assert "FLIP_AI_TREASURY_BUFFER_PERCENT" not in read("app/admin/(secure)/treasury/page.tsx")
