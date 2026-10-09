from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_runtime_recovers_once_from_a_truncated_response_and_only_from_that():
    runtime = read("lib/flip-ai/conversation-runtime.ts")
    assert "error.code === 'OPENAI_RESPONSE_TRUNCATED'" in runtime
    assert "if (!truncated || input.onDelta) throw error;" in runtime
    assert "maxOutputTokens: FLIP_AI_RECOVERY_MAX_OUTPUT_TOKENS," in runtime
    # One recovery attempt at most: the call appears once in the try and once in the catch.
    assert runtime.count("streamOpenAiText(input.context, onDelta") == 2
    body = runtime.split("export async function executeFlipAiConversationResponse")[1]
    for forbidden in ["while (", "for (", "setTimeout("]:
        assert forbidden not in body, forbidden


def test_adapter_itself_still_never_retries():
    adapter = read("lib/flip-ai/openai-responses.ts")
    assert adapter.count("'https://api.openai.com/v1/responses'") == 1
    assert "typed.type === 'response.incomplete'" in adapter
    assert "new OpenAiResponseError('definitive', 'OPENAI_RESPONSE_TRUNCATED')" in adapter


def test_wallet_gate_still_runs_before_any_provider_call():
    runtime = read("lib/flip-ai/conversation-runtime.ts")
    body = runtime.split("export async function executeFlipAiConversationResponse")[1]
    assert body.index("await assertFlipAiConversationRuntimeReady") < body.index("streamOpenAiText(")


def test_truncation_unit_tests_run_in_ci():
    assert "tests/flip-ai-truncated-response.test.ts" in read(".github/workflows/ci.yml")
