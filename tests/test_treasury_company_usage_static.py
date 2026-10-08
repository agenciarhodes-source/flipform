from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_usage_is_grouped_by_company_never_by_login():
    treasury = read("lib/flip-ai/treasury.ts")
    query = treasury.split("prisma.$queryRaw<CompanyUsageRow[]>")[1].split("`),")[0]
    assert "GROUP BY e.tenant_id, t.name" in query
    assert "FROM flip_ai_usage_events e" in query
    assert "INNER JOIN tenants t ON t.id = e.tenant_id" in query
    assert "user_id" not in query
    assert "LIMIT 100" in query
    assert "companyUsage30d," in treasury


def test_undebited_operations_are_confirmed_but_not_charged():
    treasury = read("lib/flip-ai/treasury.ts")
    billing = read("lib/flip-ai/usage-billing.ts")
    for status in ["insufficient_balance", "billing_unavailable", "failed", "charged"]:
        assert f"'{status}'" in billing
    assert treasury.count("IN ('insufficient_balance', 'billing_unavailable', 'failed')") == 2
    assert "e.status = 'confirmed' AND e.metadata->'billing'->>'status' = 'charged'" in treasury


def test_company_usage_stays_read_only_and_admin_only():
    treasury = read("lib/flip-ai/treasury.ts")
    for forbidden in ["UPDATE ", "INSERT ", "DELETE FROM", "$executeRaw", "recordFlipAiCreditEntry"]:
        assert forbidden not in treasury, forbidden
    assert "withPlatformAdmin" in read("app/api/admin/flip-ai/treasury/route.ts")


def test_treasury_page_shows_company_usage_table():
    page = read("app/admin/(secure)/treasury/page.tsx")
    assert "Consumo por empresa — 30 dias" in page
    assert "Soma todos os acessos de cada empresa." in page
    for column in ["Operações confirmadas", "Cobradas", "Sem débito", "Não faturáveis", "Créditos consumidos", "Custo coberto", "Custo sem débito"]:
        assert f">{column}<" in page
    assert "treasury.companyUsage30d.map" in page
    assert page.index("Consumo por empresa — 30 dias") < page.index("Maiores obrigações por cliente")


def test_internal_cost_stays_out_of_the_customer_usage_page():
    customer = read("app/(app)/flip-ai/usage/page.tsx")
    for forbidden in ["chargedCostUsd", "undebitedCostUsd", "nanoUsdToUsd", "formatUsd"]:
        assert forbidden not in customer, forbidden
