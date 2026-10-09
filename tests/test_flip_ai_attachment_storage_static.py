from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = "prisma/migrations/20261010120000_chat_attachment_storage/migration.sql"
STORAGE = "lib/flip-ai/chat-attachment-storage.ts"
DOWNLOAD = "app/api/leads/[id]/attachments/[attachmentId]/route.ts"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_files_are_kept_seven_days_and_then_deleted():
    storage = read(STORAGE)
    assert "FLIP_AI_ATTACHMENT_RETENTION_DAYS = 7;" in storage
    assert "expiresAt: new Date(now.getTime() + RETENTION_MS)," in storage
    assert "deleteMany({ where: { expiresAt: { lte: now } } })" in storage
    # Old files are cleared on every upload, so expiry does not depend on a scheduler.
    assert storage.index("await purgeExpiredChatAttachments(now);") < storage.index("await prisma.chatAttachment.upsert({")
    assert "purgeExpiredChatAttachments" in read("app/api/cron/chat-attachments/route.ts")
    assert "isCronRequestAuthorized(req)" in read("app/api/cron/chat-attachments/route.ts")


def test_expired_or_foreign_files_are_never_served():
    storage = read(STORAGE)
    load = storage.split("export async function loadLeadChatAttachment")[1]
    assert "tenantId: input.tenantId, expiresAt: { gt: now }" in load
    assert "leadId: input.leadId" in load
    listing = storage.split("export async function listLeadChatAttachments")[1].split("export async function loadLeadChatAttachment")[0]
    assert "expiresAt: { gt: now }," in listing
    assert "content: true" not in listing


def test_download_follows_lead_permissions_and_is_audited():
    route = read(DOWNLOAD)
    assert "export const GET = withPermission('LEADS_VIEW'" in route
    assert "where: { id: ctx.params.id, tenantId: session.tenantId }" in route
    assert route.index("assertCanAccessLead(session, lead);") < route.index("loadLeadChatAttachment({")
    assert "action: 'lead.flip_ai_attachment_downloaded'," in route
    assert "'X-Content-Type-Options': 'nosniff'," in route
    assert "attachment; filename=" in route


def test_storing_never_interrupts_the_conversation():
    storage = read(STORAGE)
    store = storage.split("export async function storeChatAttachment")[1].split("export async function listLeadChatAttachments")[0]
    assert "return { stored: false as const };" in store
    assert "throw" not in store
    route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    assert "await storeChatAttachment({" in route
    assert "clientMessageId: turn.messageId," in route


def test_migration_only_creates_one_table():
    lines = [line for line in read(MIGRATION).splitlines() if not line.strip().startswith("--")]
    sql = "\n".join(lines).upper()
    for forbidden in ["DROP ", "TRUNCATE", "DELETE FROM", "UPDATE ", "INSERT ", "ALTER TABLE"]:
        assert forbidden not in sql, forbidden
    assert sql.count("CREATE TABLE") == 1
    assert "flip_ai" not in Path(MIGRATION).parent.name
    assert '@@map("chat_attachments")' in read("prisma/schema.prisma")


def test_lead_shows_the_documents_with_a_download_link_and_the_expiry():
    modal = read("components/lead-detail-modal.tsx")
    assert "Documentos enviados" in modal
    assert "href={`/api/leads/${lead.id}/attachments/${attachment.id}`}" in modal
    assert "disponível até {formatDateTime(attachment.expiresAt)}" in modal
    assert "flipAiAttachments," in read("app/api/leads/[id]/route.ts")
