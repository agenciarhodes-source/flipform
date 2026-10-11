from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = "lib/flip-ai/chat-attachment-library.ts"
ROUTE = "app/api/leads/[id]/attachments/[attachmentId]/route.ts"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_only_ready_unexpired_files_of_that_lead_and_company_are_reachable():
    library = read(LIBRARY)
    find = library.split("async function findLeadChatAttachment")[1].split("export async function createLeadChatAttachmentDownload")[0]
    for guard in ["tenantId: input.tenantId,", "conversationId: { in: conversationIds },", "status: 'ready',",
                  "expiresAt: { gt: input.now },"]:
        assert guard in find, guard
    listing = library.split("export async function listLeadChatAttachments")[1].split("async function findLeadChatAttachment")[0]
    assert "status: 'ready'," in listing and "expiresAt: { gt: now }," in listing
    assert "objectKey" not in listing


def test_download_follows_lead_permissions_is_audited_and_uses_a_short_link():
    route = read(ROUTE)
    get = route.split("export const GET")[1].split("export const DELETE")[0]
    assert "withPermission('LEADS_VIEW'" in get
    assert "where: { id: ctx.params.id, tenantId: session.tenantId }" in get
    assert get.index("assertCanAccessLead(session, lead);") < get.index("createLeadChatAttachmentDownload({")
    assert "action: 'lead.chat_attachment_downloaded'," in get
    assert "NextResponse.redirect(download.url, { status: 302" in get
    assert "downloadName: file.name" in read(LIBRARY)


def test_only_senior_roles_delete_and_the_attendant_cannot():
    library = read(LIBRARY)
    assert "CHAT_ATTACHMENT_DELETE_ROLES: readonly string[] = ['owner', 'admin', 'manager'];" in library
    delete = read(ROUTE).split("export const DELETE")[1]
    assert delete.index("if (!canDeleteChatAttachment(session.role)) {") < delete.index("prisma.lead.findFirst(")
    assert delete.index("assertCanAccessLead(session, lead);") < delete.index("deleteLeadChatAttachment({")
    assert "action: 'lead.chat_attachment_deleted'," in delete
    remove = library.split("export async function deleteLeadChatAttachment")[1]
    # Storage is cleared first; the record is kept as deleted, never removed.
    assert remove.index("await deleteAttachmentObject(storage.config, { key: file.objectKey });") < remove.index("status: 'deleted'")
    assert "chatAttachment.delete" not in library


def test_lead_shows_documents_with_download_and_a_guarded_delete_button():
    modal = read("components/lead-detail-modal.tsx")
    assert "Documentos enviados" in modal
    assert "href={`/api/leads/${lead.id}/attachments/${attachment.id}`}" in modal
    assert "disponível até {formatDateTime(attachment.expiresAt)}" in modal
    assert "{lead.canDeleteChatAttachments && (" in modal
    assert "window.confirm(`Apagar" in modal
    api = read("app/api/leads/[id]/route.ts")
    assert "canDeleteChatAttachments: canDeleteChatAttachment(session.role)," in api
    assert api.index("assertCanAccessLead(session, lead)") < api.index("const chatAttachments = await listLeadChatAttachments(")
