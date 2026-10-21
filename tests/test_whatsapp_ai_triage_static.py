from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_whatsapp_ai_is_told_to_triage_not_to_explain_or_assume():
    text = (ROOT / "lib/whatsapp-ai/reply.ts").read_text(encoding="utf-8")
    assert "SEU PAPEL É A TRIAGEM (prioridade máxima)" in text
    assert "SEM EXPLICAÇÕES DESNECESSÁRIAS" in text
    assert "NÃO PRESUMA NADA" in text
    assert "que o filho já nasceu" in text
    assert "MOMENTO DE QUALIFICAR" in text
    assert "Nunca qualifique com base em suposição." in text
