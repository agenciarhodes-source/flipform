from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_transcripts_are_kept_and_reused():
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "const kept = messageTranscript(input.message.metadata);" in reply
    assert "await keepTranscript(input.tenantId, input.message.id, text);" in reply
    assert "await transcribeRecentVoiceNotes({" in reply
    assert "jsonb_build_object('transcript'" in reply


def test_the_ai_and_the_review_read_voice_notes():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "type: { in: ['text', 'audio'] }" in chat
    assert "const content = historyContent(message);" in chat
    reviews = read("lib/whatsapp-ai/reviews.ts")
    assert "const body = transcript ? `[áudio] ${transcript}`" in reviews


def test_the_inbox_shows_the_transcript():
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "Transcrição: “{audioTranscript(message.metadata)}”" in inbox
