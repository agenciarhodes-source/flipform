"""Operational backup retention; no production mutation or retroactive purge."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(path):return (ROOT/path).read_text(encoding="utf-8")
def test_whatsapp_backup_30_days_and_legacy_rows_capped():
    archive=read("lib/whatsapp-ai/media-archive.ts")
    policy=read("lib/storage/attachment-retention.ts")
    assert "WHATSAPP_BACKUP_DAYS = 30" in policy
    assert "WHATSAPP_MEDIA_RETENTION_DAYS = WHATSAPP_BACKUP_DAYS" in archive
    assert "expiresAt: new Date(now.getTime() + WHATSAPP_MEDIA_RETENTION_DAYS * 86_400_000)," in archive
    assert "AND: [backupWindow(now)]" in read("lib/flip-ai/chat-attachment-library.ts")
    assert "createdAt:{gt:backupCutoff(new Date())}" in read("lib/gojus/bundle-service.ts")
    assert "FLIP_AI_ATTACHMENT_RETENTION_DAYS = 7" in read("lib/flip-ai/chat-attachment-upload.ts")
    assert "MAX_ARCHIVE_BYTES = 32 * 1024 * 1024" in archive
def test_audio_and_backup_download_integrity():
    route=read("app/api/inbox/messages/[id]/media/route.ts")
    assert "readAttachmentRange(storage.config" in route
    assert "attachmentObjectExists(storage.config" in route
    assert "bytes.byteLength === copy.sizeBytes" in route
    assert "data.byteLength!==last-start+1" in read("components/inbox/complete-audio.tsx")
    assert "info.file_size!==size" in read("lib/meta/whatsapp-media.ts")
