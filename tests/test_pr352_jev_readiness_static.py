from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_readiness_route_is_admin_only_rate_limited_and_never_accepts_user_state():
    route = read("app/api/admin/integrations/jev/readiness/route.ts")
    assert "withPlatformAdmin" in route
    assert "rateLimit" in route
    assert "runJevSyntheticReadinessProbe()" in route
    assert "await req.json" not in route
    assert "TYPESAFE_API_KEY" in route
    assert "apiKey:" not in route


def test_probe_is_synthetic_and_does_not_unlock_real_data_processing():
    adapter = read("lib/flip-ai/jev-decision-engine.ts")
    runbook = read("docs/flip-ai/JEV-PRIVACY-RUNBOOK.md")
    assert "Synthetic test:" in adapter
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED" not in adapter.split("runJevSyntheticReadinessProbe", 1)[1].split("async function routeBrainProfile", 1)[0]
    assert "does not authorize real customer data" in runbook
    assert "does not read tenants, leads, conversations, knowledge, documents, or Markdown" in runbook
