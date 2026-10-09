from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_streaming_reply_shows_a_typing_text_instead_of_a_spinner():
    shell = (ROOT / "components/flip-ai/public-chat-shell.tsx").read_text(encoding="utf-8")
    block = shell.split("{message.streaming && (")[1].split(")}")[0]
    assert "Escrevendo" in block
    assert 'role="status"' in block
    assert "animate-spin" not in block
    assert 'aria-label="Respondendo"' not in shell
