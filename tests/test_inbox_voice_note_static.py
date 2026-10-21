from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_team_can_record_and_send_voice_notes():
    route = read("app/api/conversations/[id]/messages/whatsapp-audio/route.ts")
    assert "withPermission('LEADS_CONTACT_WHATSAPP'" in route
    assert "prepareVoiceNote(" in route
    assert "pauseConversationAi(" in route
    outbound = read("lib/meta/whatsapp-outbound.ts")
    assert "await assertRequesterCanSend({ tenantId, userId: input.requestedByUserId.trim(), conversationId: input.conversationId.trim() });" in outbound
    assert "{ type: 'audio', audio: { id: input.audio.id, ...(input.audio.voice ? { voice: true } : {}) } }" in outbound
    assert "type: audio ? 'audio' : 'text'," in outbound
    assert "<VoiceRecorder disabled={sending || !canSendWhatsApp} onSend={sendAudio} />" in read("app/(app)/inbox/inbox-client.tsx")
