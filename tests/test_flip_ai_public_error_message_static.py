from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES = [
    "app/api/flip-ai/public/[slug]/messages/route.ts",
    "app/api/flip-ai/public/[slug]/realtime/session/route.ts",
]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_public_routes_never_return_the_raw_platform_error_message():
    for path in ROUTES:
        route = read(path)
        assert "toPublicFlipAiErrorMessage(" in route, path
        assert "error: error.message" not in route, path
    assert "? failure.message" not in read(ROUTES[0])


def test_error_code_is_preserved_for_logs_and_tenant_screens():
    messages = read(ROUTES[0])
    assert "code: error.code," in messages
    assert "code: failure.code," in messages
    helper = read("lib/flip-ai/public-error-message.ts")
    for code in ["FLIP_AI_CREDIT_BALANCE_INSUFFICIENT", "FLIP_AI_RUNTIME_BILLING_UNAVAILABLE", "OPENAI_API_KEY_MISSING"]:
        assert f"'{code}'" in helper


def test_tenant_facing_wallet_message_is_unchanged():
    runtime = read("lib/flip-ai/conversation-runtime.ts")
    assert "Saldo de créditos Flip AI insuficiente. Adicione créditos para continuar." in runtime


def test_unit_test_runs_in_ci():
    assert "tests/flip-ai-public-error-message.test.ts" in read(".github/workflows/ci.yml")
