from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_secret_alias_matching_uses_token_boundaries():
    privacy = read("lib/flip-ai/jev-privacy.ts")
    assert "function keyTokens(key: string)" in privacy
    assert "const SECRET_KEY_SUFFIXES" in privacy
    assert "function hasTokenSuffix" in privacy
    assert "normalized.endsWith(secretName)" not in privacy


def test_portuguese_private_key_label_remains_redacted():
    privacy = read("lib/flip-ai/jev-privacy.ts")
    assert "chave\\s+privada" in privacy


def test_boundary_fix_preserves_data_gate_and_has_no_migration():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'" in engine
    assert not list((ROOT / "prisma" / "migrations").glob("*pr368*"))
