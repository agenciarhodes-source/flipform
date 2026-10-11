from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = (ROOT / "lib/flip-ai/chat-attachment-library.ts").read_text(encoding="utf-8")
PURGE = LIBRARY.split("export async function purgeExpiredChatAttachments")[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_expired_files_and_abandoned_uploads_are_removed_from_storage():
    assert "{ status: { in: ['pending', 'ready'] }, expiresAt: { lte: now } }," in PURGE
    assert "{ status: 'pending', createdAt: { lte: new Date(now.getTime() - ABANDONED_UPLOAD_MS) } }," in PURGE
    # The file leaves storage before the record says it is gone, and the record is never deleted.
    assert PURGE.index("await deleteAttachmentObject(storage.config, { key: row.objectKey });") < PURGE.index("status: 'deleted'")
    assert "chatAttachment.delete" not in LIBRARY
    assert "failed += 1;" in PURGE


def test_cleanup_runs_from_a_protected_job_and_on_every_new_upload():
    cron = read("app/api/cron/chat-attachments/route.ts")
    assert cron.index("isCronRequestAuthorized(req)") < cron.index("await purgeExpiredChatAttachments()")
    upload = read("app/api/flip-ai/public/[slug]/attachments/route.ts")
    assert "await purgeExpiredChatAttachments({ limit: 10 }).catch(() => undefined);" in upload
    assert upload.index("purgeExpiredChatAttachments({ limit: 10 })") < upload.index("issueChatAttachmentUpload({")
