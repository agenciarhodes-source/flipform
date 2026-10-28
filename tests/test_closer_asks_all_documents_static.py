from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_closer_asks_every_document_at_once():
    role = (ROOT / "lib/flip-ai/attendant-role.ts").read_text(encoding="utf-8")
    assert "mande de uma vez a lista completa" in role
    assert "Não pergunte antes quais a pessoa tem nem o formato do documento" in role
    assert "pergunte quais a pessoa já tem" not in role
