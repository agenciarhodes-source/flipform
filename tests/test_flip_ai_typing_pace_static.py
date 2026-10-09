from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_reply_is_revealed_only_after_the_typing_pace():
    shell = read("components/flip-ai/public-chat-shell.tsx")
    assert "import { resolveTypingDelayMs, splitReplyIntoMessages } from '@/lib/flip-ai/typing-pace';" in shell
    assert "resolveTypingDelayMs(part.length, index === 0 ? Date.now() - startedAt : 0)" in shell
    assert "{ ...message, text: part, streaming: false }" in shell
    # The text is no longer painted chunk by chunk as it arrives.
    assert "message.text + parsed.data.delta" not in shell
    # Failures are confirmed before any waiting.
    assert shell.index("if (!completed) throw new Error") < shell.index("const typingDelay =")


def test_typing_pace_is_one_global_setting_and_is_tested_in_ci():
    pace = read("lib/flip-ai/typing-pace.ts")
    for constant in ["FLIP_AI_TYPING_MS_PER_CHARACTER", "FLIP_AI_TYPING_MIN_MS", "FLIP_AI_TYPING_MAX_MS"]:
        assert "export const " + constant in pace
    assert "tests/flip-ai-typing-pace.test.ts" in read(".github/workflows/ci.yml")


def test_reply_is_split_into_chat_bubbles_only_for_text_turns():
    shell = read("components/flip-ai/public-chat-shell.tsx")
    assert "const parts = speakReply ? [assistantText] : splitReplyIntoMessages(assistantText);" in shell
    pace = read("lib/flip-ai/typing-pace.ts")
    assert "FLIP_AI_REPLY_MAX_MESSAGES = 4;" in pace
    assert "FLIP_AI_BUBBLE_MAX_CHARACTERS = 180;" in pace
    style = read("lib/flip-ai/conversation-style.ts")
    assert "Cada mensagem deve ter no máximo cerca de 180 caracteres." in style
    assert "As mensagens não precisam ter o mesmo tamanho." in style
    assert "Você não é obrigada a terminar com pergunta." in style
    assert "a pergunta vem depois do conteúdo, na última mensagem, sozinha e curta" in style
    assert "a segunda nunca é só a continuação de uma frase cortada" in style
    assert "...(inputMode === 'voice' ? [] : [" in style
