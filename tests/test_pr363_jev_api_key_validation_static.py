from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_jev_api_key_is_bounded_and_rejects_whitespace_and_controls():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "const jevApiKeySchema = z.string()" in engine
    assert ".max(512)" in engine
    assert ".regex(/^[^\\s\\u0000-\\u001f\\u007f]+$/)" in engine
    assert "TYPESAFE_API_KEY_INVALID" in engine


def test_readiness_exposes_only_key_status_and_blocks_invalid_keys_locally():
    route = read("app/api/admin/integrations/jev/readiness/route.ts")
    card = read("app/admin/(secure)/integrations/jev-readiness-card.tsx")
    assert "getJevApiKeyStatus()" in route
    assert "apiKeyValid: apiKeyStatus === 'valid'" in route
    assert "providerCalled: false" in route
    assert "Chave configurada, mas inválida" in card
    assert "TYPESAFE_API_KEY" not in card


def test_key_validation_preserves_activation_and_integrations():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    errors = read("lib/flip-ai/jev-errors.ts")
    runbook = read("docs/flip-ai/JEV-PRIVACY-RUNBOOK.md")
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'" in engine
    assert "'TYPESAFE_API_KEY_INVALID'" in errors
    assert "never returned by readiness endpoints" in runbook
    assert not list((ROOT / "prisma" / "migrations").glob("*pr363*"))
