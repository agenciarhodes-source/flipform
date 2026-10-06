from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_global_account_defaults_do_not_enable_customer_traffic():
    env = read(".env.production.example")
    assert "FLIP_AI_JEV_ENABLED=false" in env
    assert "FLIP_AI_JEV_TENANT_IDS=\n" in env
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED=false" in env
    assert "A configured global API key alone must never enable real customer traffic." in env


def test_live_runtime_requires_tenant_scope_and_data_approval():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "isJevEnabledForTenant({" in engine
    assert "tenantIdsRaw: process.env.FLIP_AI_JEV_TENANT_IDS" in engine
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'" in engine
    assert engine.index("isJevEnabledForTenant({") < engine.index("FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'")


def test_environment_validation_rejects_incomplete_live_activation():
    validation = read("lib/config/validate-env.ts")
    assert "FLIP_AI_JEV_ENABLED=true requires TYPESAFE_API_KEY." in validation
    assert "FLIP_AI_JEV_ENABLED=true requires a valid non-empty FLIP_AI_JEV_TENANT_IDS allowlist." in validation
    assert "Live JEV requires the TypeSafe retention and Zero Data Retention review" in validation


def test_synthetic_probe_stays_independent_from_live_gates():
    route = read("app/api/admin/integrations/jev/readiness/route.ts")
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    card = read("app/admin/(secure)/integrations/jev-readiness-card.tsx")
    probe = engine.split("export async function runJevSyntheticReadinessProbe", 1)[1].split(
        "async function routeBrainProfile", 1
    )[0]
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED" not in probe
    assert "FLIP_AI_JEV_TENANT_IDS" not in probe
    assert "customerDataRead: false" in route
    assert "liveProcessingChanged: false" in route
    assert "Testar conexão com dados fictícios" in card
    assert "TYPESAFE_API_KEY" not in card


def test_activation_checklist_separates_connection_from_authorization():
    checklist = read("docs/flip-ai/JEV-ACTIVATION-CHECKLIST.md")
    assert "Phase 1 — connect the global account without customer traffic" in checklist
    assert "Phase 2 — synthetic provider verification" in checklist
    assert "Phase 3 — provider privacy review" in checklist
    assert "Phase 4 — first tenant pilot" in checklist
    assert "A successful probe proves connectivity" in checklist
    assert "one company-managed TypeSafe/JEV account" in checklist


def test_activation_regression_pr_has_no_schema_migration():
    assert not list((ROOT / "prisma" / "migrations").glob("*pr369*"))
