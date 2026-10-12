from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_audio_is_charged_to_the_company_wallet_through_the_existing_ledger():
    billing = read("lib/flip-ai/audio-usage.ts")
    assert "await settleFlipAiUsageCharge({ tenantId: input.tenantId, eventId: event.id });" in billing
    assert "status: 'confirmed'," in billing
    # The same audio is never charged twice, and a billing problem never breaks the conversation.
    assert "error.code === 'P2002'" in billing
    assert "recordFlipAiCreditEntry" not in billing
    pricing = read("lib/flip-ai/openai-pricing.ts")
    assert "price: { inputNanoUsd: 3_000, outputNanoUsd: 5_000 }," in pricing
    assert "price: { inputNanoUsd: 600, outputNanoUsd: 12_000 }," in pricing


def test_voice_message_and_spoken_reply_are_both_charged_and_need_credits():
    messages = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    assert "requestKey: `voice-transcription:${claimed.id}`," in messages
    assert messages.index("hasCreditsForAudio(runtimeContext.tenantId)") < messages.index("await transcribeVoiceNote({")
    speech = read("app/api/flip-ai/public/[slug]/speech/route.ts")
    assert "requestKey: `voice-speech:${sessionHash}:${messageId}`," in speech
    assert speech.index("hasCreditsForAudio(runtimeContext.tenantId)") < speech.index("await synthesizeReplySpeech(")
    assert speech.index("await synthesizeReplySpeech(") < speech.index("await chargeAudioUsage({")


def test_usage_report_names_the_audio_operations_and_ci_runs_the_unit_test():
    usage = read("lib/flip-ai/usage.ts")
    assert "voice_transcription: '\u00c1udio recebido'," in usage
    assert "voice_speech: 'Resposta em \u00e1udio'," in usage
    assert "tests/flip-ai-audio-usage.test.ts" in read(".github/workflows/ci.yml")
