from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_synthetic_probe_records_only_safe_operational_metadata():
    route = read("app/api/admin/integrations/jev/readiness/route.ts")
    assert "platform.jev.synthetic_probe" in route
    assert "logPlatformAudit" in route
    for field in [
        "outcome", "providerCalled", "model", "latencyMs", "inputTokens",
        "outputTokens", "syntheticDecision", "confidence", "providerStatus",
    ]:
        assert field in route
    for forbidden in [
        "requestBody", "responseBody", "apiKey:", "clientIp:", "tenantId:",
        "conversationId:", "leadId:", "document:",
    ]:
        assert forbidden not in route


def test_audit_explicitly_states_that_no_customer_data_or_gate_changed():
    route = read("app/api/admin/integrations/jev/readiness/route.ts")
    assert "customerDataRead: false" in route
    assert "liveProcessingChanged: false" in route
    assert "source: 'platform_admin_synthetic_probe'" in route


def test_provider_errors_are_allowlisted_before_logging_or_returning():
    route = read("app/api/admin/integrations/jev/readiness/route.ts")
    assert "function safeErrorCode" in route
    assert "error.message.slice" not in route
    assert "JEV_READINESS_FAILED" in route


def test_runbook_discloses_audit_without_claiming_customer_database_reads():
    runbook = read("docs/flip-ai/JEV-PRIVACY-RUNBOOK.md")
    card = read("app/admin/(secure)/integrations/jev-readiness-card.tsx")
    assert "minimal `platform.jev.synthetic_probe` audit entry" in runbook
    assert "never stores request state, provider response bodies, credentials" in runbook
    assert "auditoria técnica sem dados pessoais" in card
