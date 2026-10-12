from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEECH = "app/api/flip-ai/public/[slug]/speech/route.ts"
SHELL = "components/flip-ai/public-chat-shell.tsx"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_only_a_stored_reply_of_the_callers_own_conversation_is_spoken():
    route = read(SPEECH)
    assert "externalMessageId: `ai:${sessionHash}:${messageId}`," in route
    assert "direction: 'outbound'," in route
    assert "tenantId: runtimeContext.tenantId," in route
    assert "synthesizeReplySpeech({ text: message.text, voice })" in route
    # The browser sends only a message identifier, never the text to be spoken.
    assert "body?.messageId" in route and "body?.text" not in route
    assert route.index("rateLimit({ key: `flip-ai:speech:ip:") < route.index("synthesizeReplySpeech(")


def test_audio_is_a_choice_of_length_or_preference_not_a_reaction_to_a_voice_message():
    rules = read("lib/flip-ai/audio-reply.ts")
    assert "FLIP_AI_AUDIO_REPLY_MIN_CHARACTERS = 420;" in rules
    assert "FLIP_AI_AUDIO_PREFERENCE_KEY = 'prefere_audio';" in rules
    assert "você não responde em áudio só porque a pessoa mandou um áudio" in rules
    assert "não sabe ou não consegue ler" in rules
    route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    assert "sseData('audio', { enabled: true })" in route
    assert "storedFacts: context.memorySnapshot?.facts," in route
    assert "...(inputMode === 'voice' ? [] : audioReplyInstructions())," in read("lib/flip-ai/public-chat.ts")


def test_audio_bubble_is_played_on_demand_labelled_and_offers_the_text():
    shell = read(SHELL)
    # Sent and received audio use the same bar, with play, progress and time.
    assert "return <ChatAudioPlayer src={url} label=\"resposta em áudio\" />;" in shell
    assert "<ChatAudioPlayer src={message.audioUrl} knownSeconds={message.audioSeconds} label=\"áudio enviado\" />" in shell
    assert "body: JSON.stringify({ messageId })," in shell
    # If the audio cannot be produced the person still gets the written answer.
    assert "if (failed) return <span className=\"whitespace-pre-line\">{text}</span>;" in shell
    assert "tests/flip-ai-audio-reply.test.ts" in read(".github/workflows/ci.yml")
