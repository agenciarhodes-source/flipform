from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_secret_aliases_are_normalized_and_redacted_at_provider_boundary():
    privacy = read("lib/flip-ai/jev-privacy.ts")
    for alias in (
        "authorizationheader", "credential", "cookie", "sessionid", "privatekey",
        "signingkey", "encryptionkey", "connectionstring", "databaseurl",
    ):
        assert f"'{alias}'" in privacy
    assert "function isSecretKey(key: string)" in privacy
    assert "if (isSecretKey(key)) return [key, OMITTED.secret]" in privacy


def test_free_text_secret_formats_are_redacted_before_serialization():
    privacy = read("lib/flip-ai/jev-privacy.ts")
    assert "PRIVATE KEY-----" in privacy
    assert "Bearer\\s+" in privacy
    assert "mongodb(?:\\+srv)?" in privacy
    assert "client[_\\s-]?secret" in privacy


def test_secret_hardening_preserves_data_gate_and_has_no_migration():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'" in engine
    assert not list((ROOT / "prisma" / "migrations").glob("*pr366*"))
