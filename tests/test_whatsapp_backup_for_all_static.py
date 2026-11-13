"""The kept copy of the files the customer sends, and the lead of a new contact, are for every
company, not only the ones whose WhatsApp AI is on."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_media_copy_and_auto_lead_do_not_depend_on_the_ai():
    runtime = (ROOT / "lib/meta/whatsapp-runtime.ts").read_text(encoding="utf-8")
    ai_block = runtime.index("if (aiOn) {")
    archive = runtime.index("result.mediaToArchive.push(")
    block_end = runtime.index("}", runtime.index("result.aiCandidates.push(", ai_block))
    assert archive > block_end, "the media copy must be outside the AI block"
    assert "shouldCreateWhatsAppLead({ hasLead: linked, aiOn," in runtime
    assert "createWhatsAppConversationLead(" in runtime
