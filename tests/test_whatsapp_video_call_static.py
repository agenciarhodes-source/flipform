from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_video_call_request_sends_nothing_and_creates_the_task():
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "VIDEO_CALL_INSTRUCTION," in reply
    start = reply.index("if (customerAsksVideoCall(turnText))")
    block = reply[start:start + 500]
    assert "handOffForVideoCall(" in block
    assert "return { replied: false, reason: 'video_call_handoff' }" in block
    # Before the model is called: nothing is written to the customer and no credit is spent.
    assert start < reply.index("const raw = await executeFlipAiConversationResponse(")
    marker = reply.index("if (extractVideoCall(parsed.reply).requested)")
    assert marker < reply.index("enqueueAndDispatchWhatsAppTextMessage({", marker)
    assert "return { replied: false, reason: 'video_call_handoff' }" in reply[marker:marker + 500]


def test_task_goes_to_the_lead_attendant_or_the_next_of_the_queue():
    lib = read("lib/whatsapp-ai/video-call.ts")
    assert "aiPauseReason: 'ai_handoff'" in lib
    assert "let assignee = conversation.lead?.assignedTo || conversation.assignedTo || null" in lib
    assert "assignLeadByRotationId({ tenantId: input.tenantId, rotationId, tx })" in lib
    assert "assignedTo: null }, data: { assignedTo: next.assignedTo }" in lib
    assert "createUrgentTeamTask(" in lib
