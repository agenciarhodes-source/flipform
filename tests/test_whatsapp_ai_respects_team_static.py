from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_the_ai_follows_the_team_and_never_gives_a_negative_verdict():
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "NUNCA diga ao cliente que ele não tem direito, não tem perfil" in reply
    assert "A EQUIPE JÁ ATENDEU ESTE CLIENTE" in reply
    assert "OR: [{ sentByUserId: { not: null } }, { metadata: { path: ['businessAppEcho'], equals: true } }]," in reply
    assert "        teamInvolved,\n" in reply.replace("\r\n", "\n")


def test_team_messages_are_marked_for_the_ai():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "select: { id: true, direction: true, type: true, text: true, metadata: true, sentByUserId: true }," in chat


def test_an_outcome_stage_waits_for_a_person_when_the_team_is_in():
    stages = read("lib/whatsapp-ai/stage-suggestions.ts")
    assert "const autoMove = input.mode === 'auto' && !(teamInvolved && isOutcomeStageName(accepted.stage.name));" in stages
