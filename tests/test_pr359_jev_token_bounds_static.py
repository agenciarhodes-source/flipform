from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_jev_token_telemetry_has_a_fixed_per_call_limit():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "JEV_MAX_TOKEN_COUNT_PER_CALL = 1_000_000" in engine
    assert engine.count(".max(JEV_MAX_TOKEN_COUNT_PER_CALL)") == 2
    assert "tokenCountPerCall: JEV_MAX_TOKEN_COUNT_PER_CALL" in engine


def test_all_jev_response_paths_share_the_bounded_usage_schema():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert engine.count("usage: jevResponseSchema.shape.usage") == 2
    assert "const parsed = jevResponseSchema.safeParse(raw)" in engine
    runbook = read("docs/flip-ai/JEV-PRIVACY-RUNBOOK.md")
    assert "capped at 1,000,000 per call" in runbook


def test_token_bounds_do_not_change_activation_or_schema():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'" in engine
    assert not list((ROOT / "prisma" / "migrations").glob("*pr359*"))
