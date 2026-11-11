"""Files the customer sends on WhatsApp are kept for 5 years, not 7 days (they are part of the case)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_whatsapp_files_are_kept_for_five_years():
    archive = (ROOT / "lib/whatsapp-ai/media-archive.ts").read_text(encoding="utf-8")
    assert "export const WHATSAPP_MEDIA_RETENTION_DAYS = 5 * 365;" in archive
    assert "expiresAt: new Date(now.getTime() + WHATSAPP_MEDIA_RETENTION_DAYS * 86_400_000)," in archive
    assert "FLIP_AI_ATTACHMENT_RETENTION_DAYS" not in archive
