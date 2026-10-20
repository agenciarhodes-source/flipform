from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_whatsapp_reply_never_shows_bare_source_marks():
    reply = (ROOT / "lib/whatsapp-ai/reply.ts").read_text(encoding="utf-8")
    assert "const reply = withWhatsAppSourceLinks(toWhatsAppText(parsed.reply), context.sources);" in reply
    rules = (ROOT / "lib/whatsapp-ai/eligibility.ts").read_text(encoding="utf-8")
    assert "export function withWhatsAppSourceLinks(" in rules
