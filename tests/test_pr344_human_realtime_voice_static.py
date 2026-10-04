from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr344_voice_transcript_uses_same_backend_conversation_pipeline():
    shell = read("components/flip-ai/public-chat-shell.tsx")
    chat = read("lib/flip-ai/public-chat.ts")
    assert "/messages" in shell
    assert "inputMode," in shell
    assert "sendTurn(crypto.randomUUID(), transcript, false, true, 'voice')" in shell
    assert "inputMode: z.enum(['text', 'voice'])" in chat
    assert "inputMode: turn.inputMode" in chat
    assert "runJevConversationDecision" in chat
    assert "selectHarnessHits" in chat


def test_pr344_human_conversation_policy_is_progressive_and_objection_aware():
    policy = read("lib/flip-ai/conversation-style.ts")
    assert "Faça no máximo uma pergunta por resposta" in policy
    assert "Não repita apresentação, saudação, nome, telefone" in policy
    assert "Quando houver objeção" in policy
    assert "respostas curtas como" in policy
    assert "Este turno veio de voz" in policy


def test_pr344_humanized_voice_keeps_content_approved_but_changes_prosody():
    policy = read("lib/flip-ai/conversation-style.ts")
    client = read("lib/flip-ai/realtime-client.ts")
    assert "voz humana, natural, acolhedora e profissional" in policy
    assert "cadência conversacional" in policy
    assert "Evite tom de locutor" in policy
    assert "não acrescente bordões" in policy
    assert "buildHumanizedVoiceInstructions(text)" in client
    assert "conversation: 'none'" in client
    assert "tool_choice: 'none'" in client


def test_pr344_realtime_voice_is_server_configured_and_audited():
    adapter = read("lib/flip-ai/openai-realtime.ts")
    session = read("lib/flip-ai/realtime-session.ts")
    env = read(".env.production.example")
    assert "OPENAI_FLIP_AI_REALTIME_MODEL" in adapter
    assert "OPENAI_FLIP_AI_REALTIME_VOICE" in adapter
    assert "OPENAI_FLIP_AI_TRANSCRIPTION_MODEL" in adapter
    assert "voice: result.voice" in session
    assert "transcriptionModel: result.transcriptionModel" in session
    assert "voicePolicyVersion" in session
    assert "OPENAI_FLIP_AI_REALTIME_MODEL=gpt-realtime-2.1" in env
    assert "OPENAI_FLIP_AI_REALTIME_VOICE=marin" in env
    assert "OPENAI_FLIP_AI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe" in env


def test_pr344_voice_obeys_wallet_gate_before_provider_session():
    session = read("lib/flip-ai/realtime-session.ts")
    assert "getFlipAiCreditBalanceForTenant" in session
    assert "FLIP_AI_CREDIT_BALANCE_INSUFFICIENT" in session
    assert "FLIP_AI_RUNTIME_BILLING_UNAVAILABLE" in session
    assert session.index("const wallet = await getFlipAiCreditBalanceForTenant") < session.index("result = await createClientSecret")


def test_pr344_realtime_still_never_auto_generates_unapproved_business_reply():
    adapter = read("lib/flip-ai/openai-realtime.ts")
    session = read("lib/flip-ai/realtime-session.ts")
    assert "create_response: false" in adapter
    assert "interrupt_response: false" in adapter
    assert "tool_choice: 'none'" in adapter
    assert "O backend controlará as respostas" in session


def test_pr344_has_no_model_router_or_schema_migration():
    files = [
        read("lib/flip-ai/conversation-style.ts"),
        read("lib/flip-ai/realtime-client.ts"),
        read("lib/flip-ai/realtime-session.ts"),
    ]
    for content in files:
        for forbidden in ["OpenRouter", "Anthropic", "Gemini", "Qwen", "ALTER TABLE", "CREATE TABLE", "DROP TABLE"]:
            assert forbidden not in content
