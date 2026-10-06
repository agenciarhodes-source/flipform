from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_qualified_secret_aliases_use_suffix_matching():
    privacy = read("lib/flip-ai/jev-privacy.ts")
    assert "for (const secretName of SECRET_KEY_NAMES)" in privacy
    assert "normalized.endsWith(secretName)" in privacy


def test_quoted_secret_assignments_are_redacted_completely():
    privacy = read("lib/flip-ai/jev-privacy.ts")
    assert "authorization(?:[_\\s-]?header)?" in privacy
    assert '"(?:\\\\.|[^"\\\\])*"' in privacy
    assert "'(?:\\\\.|[^'\\\\])*'" in privacy
    assert "(?:Basic|Bearer)\\s+" in privacy


def test_secret_followup_preserves_activation_gate_and_has_no_migration():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'" in engine
    assert not list((ROOT / "prisma" / "migrations").glob("*pr367*"))
