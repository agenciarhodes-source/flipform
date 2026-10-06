from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_jev_model_identifier_has_one_bounded_control_free_schema():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "const jevModelSchema = z.string()" in engine
    assert ".max(200)" in engine
    assert ".regex(/^[^\\u0000-\\u001f\\u007f]+$/)" in engine
    assert engine.count("model: jevModelSchema") == 4


def test_configured_model_is_validated_before_network_and_usage_creation():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "function resolveJevModel" in engine
    assert "if (!parsed.success) throw new Error('JEV_MODEL_INVALID')" in engine
    runtime = engine.split("export async function runJevConversationDecision", 1)[1]
    assert runtime.index("configuredModel = resolveJevModel()") < runtime.index("prisma.flipAiUsageEvent.create")


def test_model_validation_preserves_activation_and_integrations():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    errors = read("lib/flip-ai/jev-errors.ts")
    runbook = read("docs/flip-ai/JEV-PRIVACY-RUNBOOK.md")
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'" in engine
    assert "'JEV_MODEL_INVALID'" in errors
    assert "invalid returned identifier is never persisted" in runbook
    assert not list((ROOT / "prisma" / "migrations").glob("*pr362*"))
