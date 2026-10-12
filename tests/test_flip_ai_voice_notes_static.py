from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MESSAGES = "app/api/flip-ai/public/[slug]/messages/route.ts"
SHELL = "components/flip-ai/public-chat-shell.tsx"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_voice_message_becomes_the_text_of_the_turn_before_it_is_prepared():
    route = read(MESSAGES)
    assert "if (attachment.kind === 'audio') {" in route
    assert route.index("await transcribeVoiceNote({") < route.index("turn = await preparePublicChatTurn(")
    assert "text: heard.text.slice(0, 2_000), inputMode: 'text'" in route
    assert "CHAT_VOICE_NOTE_NOT_UNDERSTOOD" in route
    # The audio itself is never sent to the conversation model.
    assert "const file = attachment && attachment.kind !== 'audio' ? attachment : null;" in route


def test_reply_to_a_voice_message_is_written_not_spoken():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "responde normalmente, por escrito" in chat
    shell = read(SHELL)
    assert "void sendTurn(crypto.randomUUID(), VOICE_NOTE_LABEL, false, false, 'text', voiceNote, URL.createObjectURL(blob)," in shell


def test_recording_is_tap_to_record_then_send_or_cancel_with_a_time_limit():
    shell = read(SHELL)
    assert "const VOICE_NOTE_MAX_SECONDS = 120;" in shell
    assert 'aria-label="Cancelar gravação"' in shell
    assert 'aria-label="Enviar áudio"' in shell
    assert "discardRecordingRef.current = !send;" in shell
    assert "if (next >= VOICE_NOTE_MAX_SECONDS && recorder.state !== 'inactive') recorder.stop();" in shell
    assert "stream.getTracks().forEach((track) => track.stop());" in shell
    assert "onClick={() => void (attachmentsEnabled ? startRecording() : toggleVoice())}" in shell
    assert "recordedSecondsRef.current = next;" in shell
    assert "audio.currentTime = 1e9;" in shell


def test_voice_messages_use_the_same_checked_storage_as_other_files():
    types = read("lib/flip-ai/chat-attachment.ts")
    for mime in ["'audio/webm'", "'audio/mp4'", "'audio/ogg'", "'audio/mpeg'"]:
        assert mime in types, mime
    assert "if (mimeType.startsWith('audio/')) return 'audio';" in types
    assert "tests/flip-ai-voice-note-transcription.test.ts" in read(".github/workflows/ci.yml")
