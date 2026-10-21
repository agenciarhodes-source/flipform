from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_ai_replies_show_the_attendant_name_not_flip_ai():
    inbox = (ROOT / "app/(app)/inbox/inbox-client.tsx").read_text(encoding="utf-8")
    assert "return `${value.aiAgentName} · Atendente`;" in inbox
    assert "· Flip AI`" not in inbox
