from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_whatsapp_asks_the_name_by_clarity_and_does_not_repeat_it():
    reply = (ROOT / "lib/whatsapp-ai/reply.ts").read_text(encoding="utf-8")
    assert "termine perguntando ${nameQuestion(input.profileName)}" in reply
    assert "nameFromReply(recentOutbound[0]?.text, turnText, clearFirstName(profileName))" in reply
    assert "nameAsked: askedForName(recentOutbound.map((message) => message.text))" in reply
    assert "Não pergunte de novo e não use nenhum nome até ela dizer." in reply
    assert "Só trate como nome o que a própria pessoa disser." in reply
    assert "no máximo uma vez a cada 3 ou 4 mensagens" in reply
    assert 'não comece as respostas com "Entendi, [nome]"' in reply


def test_every_channel_uses_the_name_sparingly():
    style = (ROOT / "lib/flip-ai/conversation-style.ts").read_text(encoding="utf-8")
    assert "Use o nome da pessoa com moderação, no máximo uma vez a cada 3 ou 4 mensagens." in style
