from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr342_live_intelligence_is_derived_from_existing_jev_usage_events():
    intelligence = read("lib/flip-ai/lead-intelligence.ts")
    assert "FROM flip_ai_usage_events e" in intelligence
    assert "INNER JOIN conversations c" in intelligence
    assert "e.tenant_id = ${input.tenantId}" in intelligence
    assert "c.lead_id = ${input.leadId}" in intelligence
    assert "e.operation = 'conversation_decision'" in intelligence
    assert "e.provider = 'typesafe'" in intelligence
    assert "e.status = 'confirmed'" in intelligence
    assert "LIMIT 2" in intelligence


def test_pr342_score_policy_is_deterministic_and_versioned():
    policy = read("lib/flip-ai/lead-intelligence-policy.ts")
    assert "FLIP_AI_LEAD_SCORE_POLICY_VERSION" in policy
    assert "fitScore * 0.40" in policy
    assert "intentScore * 0.30" in policy
    assert "urgencyScore * 0.15" in policy
    assert "readinessScore * 0.10" in policy
    assert "confidenceScore * 0.05" in policy
    assert "score >= 75" in policy
    assert "fitScore <= 25" in policy
    assert "decision.confidence < 0.50" in policy


def test_pr342_jev_collects_intent_strength_and_readiness_in_same_call():
    jev = read("lib/flip-ai/jev-decision-engine.ts")
    assert "intent_strength: scoreAnswerSchema" in jev
    assert "readiness: scoreAnswerSchema" in jev
    assert "intentScore: normalizeJevOrdinalScore" in jev
    assert "readinessScore: normalizeJevOrdinalScore" in jev
    assert "questions:" in jev


def test_pr342_lead_api_exposes_snapshot_after_rbac_check():
    api = read("app/api/leads/[id]/route.ts")
    assert "assertCanAccessLead(session, lead)" in api
    assert "getFlipAiLeadIntelligence" in api
    assert api.index("assertCanAccessLead(session, lead)") < api.index("getFlipAiLeadIntelligence({ tenantId: session.tenantId")
    assert "flipAiLiveIntelligence" in api


def test_pr342_ui_is_advisory_and_does_not_claim_automatic_crm_changes():
    modal = read("components/lead-detail-modal.tsx")
    assert "Inteligência em tempo real" in modal
    assert "Score" in modal
    assert "Temperatura sugerida" in modal
    assert "Não altera o CRM automaticamente" in modal
    assert "Próxima ação sugerida" in modal
    assert "Fit 40% + Intenção 30% + Urgência 15% + Prontidão 10% + Confiança 5%" in modal


def test_pr342_never_moves_or_mutates_lead_from_intelligence_layer():
    policy = read("lib/flip-ai/lead-intelligence-policy.ts")
    intelligence = read("lib/flip-ai/lead-intelligence.ts")
    combined = policy + intelligence
    for forbidden in [
        "prisma.lead.update",
        "prisma.lead.create",
        "prisma.conversation.update",
        "prisma.pipeline",
        "prisma.stage",
        "moveLead",
        "createAppointment",
        "recordFlipAiCreditEntry",
        "ALTER TABLE",
        "CREATE TABLE",
        "DROP TABLE",
    ]:
        assert forbidden not in combined


def test_pr342_has_no_schema_migration_and_keeps_jev_as_decision_engine():
    schema = read("prisma/schema.prisma")
    decision = read("lib/flip-ai/decision-engine.ts")
    runtime = read("lib/flip-ai/conversation-runtime.ts")
    assert "intentScore?: number" in decision
    assert "readinessScore?: number" in decision
    assert "provider: 'openai'" in runtime
    assert "modelRouting: 'disabled'" in runtime
    assert "FlipAiLeadIntelligence" not in schema
