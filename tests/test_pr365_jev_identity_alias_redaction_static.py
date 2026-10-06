from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_identifier_aliases_are_normalized_and_classified_at_provider_boundary():
    privacy = read("lib/flip-ai/jev-privacy.ts")
    for alias in (
        "displayname", "phonenumber", "emailaddress", "documentnumber",
        "bankaccountnumber", "medicalrecordnumber",
    ):
        assert f"'{alias}'" in privacy
    assert ".normalize('NFKD')" in privacy
    assert "const kind = identifierKind(key)" in privacy


def test_identity_alias_redaction_keeps_pseudonymous_subject_reference():
    privacy = read("lib/flip-ai/jev-privacy.ts")
    public_chat = read("lib/flip-ai/public-chat.ts")
    assert "createHash('sha256')" in privacy
    assert "subjectRef: jevSubjectReference(turn.tenantId, turn.conversationId)" in public_chat


def test_identity_alias_hardening_preserves_data_gate_and_has_no_migration():
    engine = read("lib/flip-ai/jev-decision-engine.ts")
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED !== 'true'" in engine
    assert not list((ROOT / "prisma" / "migrations").glob("*pr365*"))
