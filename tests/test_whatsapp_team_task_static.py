"""WhatsApp AI asks the team for help without stopping the conversation (gov.br access, call an attendant...)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_marker_is_taken_out_before_sending_and_task_created_after():
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "const teamTask = extractTeamTask(parsed.reply);" in reply
    assert reply.index("extractTeamTask(parsed.reply)") < reply.index("toWhatsAppText(parsed.reply)")
    assert reply.index("const sent = voiceSent || await enqueueAndDispatchWhatsAppTextMessage({") < reply.index("createWhatsAppTeamTask({")
    assert "TEAM_TASK_INSTRUCTION," in reply
    assert "responda que o nosso time vai cuidar disso, continue o atendimento e crie a TAREFA PARA A EQUIPE" in reply
    assert "TEAM_VOICE_RULE," in reply


def test_task_is_urgent_deduplicated_and_does_not_pause_the_ai():
    lib = read("lib/whatsapp-ai/team-task.ts")
    assert "dueInMinutes: input.urgent ? URGENT_TASK_DUE_MINUTES : 60" in lib
    assert "REPEAT_WINDOW_MS" in lib
    assert "aiPaused" not in lib
    shared = read("lib/tasks/team-task.ts")
    assert "priority: 'high' as const" in shared
    assert "createUrgentTeamTask" in read("lib/contracts/zapsign-signed.ts")
