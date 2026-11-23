from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_reply_hands_the_conversation_over_on_a_video_call_request():
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "VIDEO_CALL_INSTRUCTION," in reply
    assert "customerAsksVideoCall(turnText)" in reply
    assert "await handOffForVideoCall({ tenantId: input.tenantId, conversationId: conversation.id })" in reply


def test_handoff_pauses_the_ai_and_creates_an_urgent_task_for_the_lead_attendant():
    lib = read("lib/whatsapp-ai/video-call.ts")
    assert "aiPauseReason: 'ai_handoff'" in lib
    assert "assignee: conversation.lead?.assignedTo || conversation.assignedTo || null" in lib
    assert "createUrgentTeamTask(" in lib
    assert "conversation.aiPauseReason === 'ai_handoff'" in lib
