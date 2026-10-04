from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr340_runtime_is_openai_only_without_model_router():
    runtime = read("lib/flip-ai/conversation-runtime.ts").lower()
    assert "provider: 'openai'" in runtime
    assert "modelrouting: 'disabled'" in runtime
    assert "streamopenaitext" in runtime
    for forbidden in ["openrouter", "anthropic", "gemini", "qwen", "model router", "provider router"]:
        assert forbidden not in runtime


def test_pr340_public_chat_route_uses_runtime_instead_of_calling_openai_directly():
    route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    assert "executeFlipAiConversationResponse" in route
    assert "assertFlipAiConversationRuntimeReady" in route
    assert "streamOpenAiText" not in route
    assert route.index("await assertFlipAiConversationRuntimeReady") < route.index("buildPublicChatContext(runtimeContext, turn)")
    assert route.index("buildPublicChatContext(runtimeContext, turn)") < route.index("const rawResult = await executeFlipAiConversationResponse")


def test_pr340_runtime_preflight_is_server_side_and_credit_gated():
    runtime = read("lib/flip-ai/conversation-runtime.ts")
    credits = read("lib/flip-ai/credits.ts")
    assert "process.env.OPENAI_API_KEY" in runtime
    assert "getFlipAiCreditBalanceForTenant" in runtime
    assert "wallet.balanceCredits <= 0" in runtime
    assert "FLIP_AI_CREDIT_BALANCE_INSUFFICIENT" in runtime
    assert "FLIP_AI_RUNTIME_BILLING_UNAVAILABLE" in runtime
    assert "402" in runtime
    assert "getFlipAiCreditBalanceForTenant" in credits
    assert "FROM flip_ai_credit_accounts" in credits


def test_pr340_optional_web_search_rechecks_wallet_before_provider_spend():
    web = read("lib/flip-ai/external-web-search.ts")
    assert "assertFlipAiConversationRuntimeReady" in web
    gate = web.index("await assertFlipAiConversationRuntimeReady")
    usage_event = web.index("const requestKey = `web-search:")
    provider_call = web.index("const result = await searchOpenAiWeb")
    assert gate < usage_event < provider_call


def test_pr340_usage_event_records_runtime_identity_without_schema_change():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "getFlipAiConversationExecutionPlan" in chat
    assert "runtimeVersion" in chat
    assert "runtimeProvider" in chat
    assert "runtimeTask" in chat
    assert "runtimeModality" in chat
    assert "modelRouting" in chat
    assert "provider: executionPlan.provider" in chat
    assert "model: executionPlan.model" in chat
    assert "await assertFlipAiConversationRuntimeReady({ tenantId: turn.tenantId })" in chat


def test_pr340_does_not_change_commercial_credit_formula_or_create_schema():
    runtime = read("lib/flip-ai/conversation-runtime.ts")
    billing = read("lib/flip-ai/usage-billing.ts")
    assert "FLIP_AI_NANO_USD_PER_CREDIT = 1_000" in billing
    for forbidden in [
        "ALTER TABLE",
        "CREATE TABLE",
        "DROP TABLE",
        "recordFlipAiCreditEntry(",
        "estimatedOpenAiCostCents",
    ]:
        assert forbidden not in runtime
