from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_voice_notes_keep_the_known_name_spelling():
    reply = (ROOT / "lib/whatsapp-ai/reply.ts").read_text(encoding="utf-8")
    assert "const knownNames = knownFirstNames([conversation.externalContactIdentity.displayName, conversation.lead?.name]);" in reply
    assert "hint: transcriptionHint(knownNames)," in reply
    assert "alignTranscriptNames(heard, knownNames)" in reply
    assert "preferredName: alignNameSpelling(parsed.identity?.name || nameInAnswer, knownNames)," in reply
    transcription = (ROOT / "lib/flip-ai/openai-transcription.ts").read_text(encoding="utf-8")
    assert "if (input.prompt?.trim()) form.set('prompt', input.prompt.trim().slice(0, 400));" in transcription
