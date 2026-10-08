from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HELPER = "lib/admin/client-flip-ai-summary.ts"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_wallet_summary_is_aggregated_per_company_and_read_only():
    helper = read(HELPER)
    assert "prisma.flipAiCreditAccount.findMany" in helper
    assert "prisma.flipAiCreditLedgerEntry.groupBy" in helper
    assert "by: ['tenantId', 'entryType']" in helper
    assert helper.count("tenantId: { in: tenantIds }") == 2
    for forbidden in ["userId", ".create(", ".update(", ".upsert(", ".delete(", "deleteMany", "updateMany", "$executeRaw"]:
        assert forbidden not in helper, forbidden


def test_wallet_summary_speaks_only_commercial_credits():
    combined = read(HELPER) + read("app/admin/(secure)/tenants/page.tsx")
    for forbidden in ["nanoUsd", "NanoUsd", "costUsd", "US$", "openai-pricing", "estimatedCost"]:
        assert forbidden not in combined, forbidden


def test_client_list_survives_a_wallet_read_failure():
    helper = read(HELPER)
    assert "return null;" in helper.split("} catch {")[1]
    route = read("app/api/admin/tenants/route.ts")
    assert "getClientFlipAiSummaries(tenants.map((tenant) => tenant.id))" in route
    assert "flipAi: resolveClientFlipAiSummary(flipAiSummaries, t.id)" in route
    assert "withPlatformAdmin" in route


def test_clients_page_shows_wallet_and_consumption_per_company():
    page = read("app/admin/(secure)/tenants/page.tsx")
    assert ">Carteira IA<" in page
    assert ">Consumo IA (30 dias)<" in page
    assert "t.flipAi.balanceCredits" in page
    assert "t.flipAi.consumedCredits30d" in page
    assert "A carteira e o consumo de IA são da empresa, somando todos os acessos dela." in page
