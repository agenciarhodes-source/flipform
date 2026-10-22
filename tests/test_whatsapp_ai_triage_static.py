from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_whatsapp_ai_is_told_to_triage_then_close_without_explaining_or_assuming():
    text = (ROOT / "lib/whatsapp-ai/reply.ts").read_text(encoding="utf-8")
    assert "SEU PAPEL É A TRIAGEM (prioridade máxima) E, DEPOIS, O FECHAMENTO" in text
    assert "SEM EXPLICAÇÕES DESNECESSÁRIAS" in text
    assert "NÃO PRESUMA NADA" in text
    assert "é uma' + ' conversa, não um questionário" in text.replace("\n", "").replace("      ", "") or "não um questionário" in text
    assert "MOMENTO DE QUALIFICAR" in text
    assert "Nunca qualifique com base em suposição." in text


def test_global_whatsapp_instructions_have_no_law_firm_wording():
    text = (ROOT / "lib/whatsapp-ai/reply.ts").read_text(encoding="utf-8")
    start = text.index("function whatsappInstructions(")
    block = text[start:text.index("].join(", start)]
    for word in ("advogado", "escritório", "INSS", "BPC", "auxílio-doença", "filho"):
        assert word not in block, word


def test_every_attendant_gets_the_commercial_policy():
    style = (ROOT / "lib/flip-ai/conversation-style.ts").read_text(encoding="utf-8")
    assert "export function buildCommercialGuidance()" in style
    assert "...buildCommercialGuidance()," in style
    assert "OBJETIVO COMERCIAL" in style
    assert "As regras e restrições da base de conhecimento da empresa valem acima destas orientações" in style
