from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_admin_usage_endpoint_is_platform_admin_only_and_tenant_explicit():
    route = read("app/api/admin/tenants/[id]/flip-ai-usage/route.ts")
    assert "withPlatformAdmin" in route
    assert "ctx.params.id" in route
    assert "getFlipAiUsageDashboardForTenant" in route
    assert "resolveFlipAiUsageRange" in route


def test_usage_ledger_remains_strictly_tenant_scoped():
    usage = read("lib/flip-ai/usage.ts")
    assert "WHERE tenant_id = ${tenantId}" in usage
    assert "WHERE e.tenant_id = ${tenantId}" in usage
    assert "getFlipAiUsageDashboardForTenant" in usage
    assert "tenantId: string" in usage


def test_admin_usage_exposes_operational_metrics_without_message_content():
    usage = read("lib/flip-ai/usage.ts")
    page = read("app/admin/(secure)/tenants/[id]/page.tsx")
    for field in [
        "inputTokens",
        "outputTokens",
        "billedCostNanoUsd",
        "chargedCredits",
        "billedOperations",
        "provider",
        "model",
        "priceSnapshot",
    ]:
        assert field in usage
    assert 'value="flip-ai-usage"' in page
    assert "Ledger de consumo da OpenAI" in page
    assert "Tokens processados" in page
    assert "Custo API contabilizado" in page
    assert "Créditos debitados" in page
    usage_tab = route_response_contract(page)
    for sensitive_binding in ["event.prompt", "event.message", "event.requestkey", "event.metadata"]:
        assert sensitive_binding not in usage_tab


def route_response_contract(page: str) -> str:
    start = page.index('TabsContent value="flip-ai-usage"')
    end = page.index('TabsContent value="history"')
    return page[start:end].lower()


def test_usage_admin_pr_is_read_only_for_operational_entities_and_has_no_schema_change():
    route = read("app/api/admin/tenants/[id]/flip-ai-usage/route.ts")
    usage = read("lib/flip-ai/usage.ts")
    for forbidden in [
        "prisma.lead.update",
        "prisma.lead.delete",
        "prisma.tenant.update",
        "prisma.flipAiUsageEvent.delete",
        "ALTER TABLE",
        "CREATE TABLE",
        "DROP TABLE",
    ]:
        assert forbidden not in route
        assert forbidden not in usage
