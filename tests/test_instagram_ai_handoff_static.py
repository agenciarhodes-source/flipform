"""Instagram AI: 'I told the team' is only said when the team is really called (paused AI + urgent task)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_reply_calls_the_team_for_real():
    reply = read("lib/instagram-ai/reply.ts")
    assert "const callTeam = instagramWantsTeam(parsed.reply);" in reply
    assert "withoutTeamMarker(parsed.reply) || INSTAGRAM_HANDOFF_REPLY" in reply
    # Called only after the reply was sent.
    assert reply.index("enqueueAndDispatchInstagramTextMessage({\n      tenantId: input.tenantId,\n      conversationId: conversation.id,\n      requestedByUserId: '',\n      text: reply,".replace("\n", "\r\n") if "\r\n" in reply else "enqueueAndDispatchInstagramTextMessage({\n      tenantId: input.tenantId,\n      conversationId: conversation.id,\n      requestedByUserId: '',\n      text: reply,") < reply.index("handOffInstagramConversation({")


def test_handoff_pauses_and_creates_urgent_task():
    handoff = read("lib/instagram-ai/handoff.ts")
    assert "aiPauseReason: INSTAGRAM_HANDOFF_PAUSE_REASON" in handoff
    assert "prisma.task.createMany" in handoff and "priority: 'high' as const" in handoff and "remindMinutesBefore: 5" in handoff
    pause = read("lib/whatsapp-ai/pause.ts")
    assert "conversation.aiPauseReason === 'ai_handoff'" in pause
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "ai_handoff: 'passada pela IA para a equipe'" in inbox


def test_old_empty_promise_is_gone():
    rules = read("lib/instagram-ai/rules.ts")
    assert "diga que vai avisar a equipe" not in rules
    assert "INSTAGRAM_HANDOFF_INSTRUCTION," in rules
    assert "tests/instagram-ai-handoff-rules.test.ts" in read(".github/workflows/ci.yml")
