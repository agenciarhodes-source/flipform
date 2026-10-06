from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_jev_timeout_is_integer_and_bounded_before_network_access():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "const JEV_MIN_TIMEOUT_MS = 100" in engine
    assert "const JEV_MAX_TIMEOUT_MS = 10_000" in engine
    assert "Number.isSafeInteger(raw)" in engine
    assert "const timeoutMs = resolveJevTimeout(options?.timeoutMs)" in engine
    assert engine.index("resolveJevTimeout(options?.timeoutMs)") < engine.index("(options?.fetchImpl || fetch)(JEV_ENDPOINT")


def test_timeout_diagnostic_is_safe_and_documented():
    errors = read("lib/flip-ai/jev-errors.ts")
    runbook = read("docs/flip-ai/JEV-PRIVACY-RUNBOOK.md")
    assert "'JEV_TIMEOUT_INVALID'" in errors
    assert "default is 2.5 seconds" in runbook
    assert "before network access" in runbook


def test_timeout_hardening_preserves_data_gate_and_has_no_migration():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'" in engine
    assert not list((ROOT / "prisma" / "migrations").glob("*pr364*"))
