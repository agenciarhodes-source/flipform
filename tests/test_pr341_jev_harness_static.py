from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr341_jev_is_decision_engine_not_model_router():
    decision = read("lib/flip-ai/decision-engine.ts").lower()
    adapter = read("lib/flip-ai/jev-decision-engine.ts").lower()
    runtime = read("lib/flip-ai/conversation-runtime.ts").lower()

    assert "conversationdecision" in decision
    assert "provider: 'openai'" in runtime
    assert "modelrouting: 'disabled'" in runtime
    assert "conversation_decision" in adapter
    assert "provider: 'typesafe'" in adapter

    for forbidden in ["openrouter", "anthropic", "gemini", "qwen", "model router"]:
        assert forbidden not in decision
        assert forbidden not in adapter


def test_pr341_jev_is_server_side_opt_in_and_tenant_allowlisted():
    adapter = read("lib/flip-ai/jev-decision-engine.ts")
    decision = read("lib/flip-ai/decision-engine.ts")
    env = read(".env.example")

    assert "TYPESAFE_API_KEY" in adapter
    assert "FLIP_AI_JEV_ENABLED" in adapter
    assert "FLIP_AI_JEV_TENANT_IDS" in adapter
    assert "isJevEnabledForTenant" in decision
    assert "FLIP_AI_JEV_ENABLED=false" in env
    assert "TYPESAFE_API_KEY=" in env
    assert "FLIP_AI_JEV_TENANT_IDS=" in env
    assert "TYPESAFE_API_KEY" not in read("app/admin/(secure)/tenants/[id]/page.tsx")


def test_pr341_harness_optimization_is_scoped_to_same_pilot_gate():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "const intelligentHarnessEnabled = isJevEnabledForTenant" in chat
    assert "intelligentHarnessEnabled" in chat
    assert "selectHarnessHits" in chat
    assert "buildBudgetedHistory" in chat
    assert "candidates.slice(0, 7)" in chat
    assert "chronological.slice(-14)" in chat


def test_pr341_harness_has_explicit_token_budget_and_metrics():
    harness = read("lib/flip-ai/harness-resolver.ts")
    usage = read("lib/flip-ai/usage.ts")
    page = read("app/admin/(secure)/tenants/[id]/page.tsx")

    assert "FLIP_AI_HARNESS_DEFAULT_TOKEN_BUDGET = 1_200" in harness
    assert "candidateTokens" in harness
    assert "selectedTokens" in harness
    assert "avoidedTokens" in harness
    assert "savingsPercent" in harness

    assert "harnessCandidateTokens" in usage
    assert "harnessSelectedTokens" in usage
    assert "harnessAvoidedTokens" in usage
    assert "harnessSavingsPercent" in usage

    assert "Contexto evitado pelo Harness" in page
    assert "Economia de contexto" in page
    assert "Decisões JEV" in page


def test_pr341_jev_batches_typed_questions_in_one_call():
    adapter = read("lib/flip-ai/jev-decision-engine.ts")
    assert "https://api.typesafe.ai/v1/systemone" in adapter
    assert "questions:" in adapter
    for question in [
        "intent:",
        "objection:",
        "journey_stage:",
        "next_action:",
        "fit:",
        "urgency:",
        "needs_human:",
    ]:
        assert question in adapter
    assert "type: 'choice'" in adapter
    assert "type: 'score'" in adapter
    assert "type: 'noul'" in adapter


def test_pr341_decision_engine_never_moves_leads_or_executes_business_actions():
    decision = read("lib/flip-ai/decision-engine.ts")
    adapter = read("lib/flip-ai/jev-decision-engine.ts")
    harness = read("lib/flip-ai/harness-resolver.ts")

    for forbidden in [
        "prisma.lead.update",
        "prisma.lead.create",
        "prisma.conversation.update",
        "prisma.pipeline",
        "prisma.stage",
        "createappointment",
        "movelead",
    ]:
        assert forbidden.lower() not in decision.lower()
        assert forbidden.lower() not in adapter.lower()
        assert forbidden.lower() not in harness.lower()


def test_pr341_has_no_schema_migration_or_commercial_credit_formula_change():
    adapter = read("lib/flip-ai/jev-decision-engine.ts")
    harness = read("lib/flip-ai/harness-resolver.ts")
    billing = read("lib/flip-ai/usage-billing.ts")

    assert "FLIP_AI_NANO_USD_PER_CREDIT = 1_000" in billing
    for content in [adapter, harness]:
        for forbidden in ["ALTER TABLE", "CREATE TABLE", "DROP TABLE", "recordFlipAiCreditEntry("]:
            assert forbidden not in content


def test_pr341_decision_state_omits_direct_phone_and_email_patterns():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "[email omitido]" in chat
    assert "[telefone omitido]" in chat
    assert "sanitizeDecisionStateText" in chat
