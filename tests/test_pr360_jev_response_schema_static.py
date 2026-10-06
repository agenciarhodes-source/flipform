from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_jev_answers_keep_only_bounded_fields_used_by_flipform():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "choice: z.string().min(1).max(64)" in engine
    assert "score: z.number().min(0).max(4)" in engine
    assert engine.count("}).strip();") >= 4
    assert "probabilities: z.record" not in engine


def test_live_jev_requires_the_exact_requested_answer_set():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "function hasExactKeys" in engine
    assert "hasExactKeys(parsed.data.answers, Object.keys(request.questions))" in engine
    assert "Object.hasOwn(value, key)" in engine


def test_response_allowlist_does_not_change_activation_or_integrations():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    runbook = read("docs/flip-ai/JEV-PRIVACY-RUNBOOK.md")
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'" in engine
    assert "Provider answers use an allowlisted schema" in runbook
    assert not list((ROOT / "prisma" / "migrations").glob("*pr360*"))
