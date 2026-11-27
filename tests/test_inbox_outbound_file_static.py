from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


BASE = "app/api/conversations/[id]/messages/whatsapp-file"


def test_routes_need_permission_plan_and_rate_limit():
    for path in (f"{BASE}/route.ts", f"{BASE}/upload/route.ts"):
        route = read(path)
        assert "withPermission('LEADS_CONTACT_WHATSAPP'" in route
        assert "tenantHasMessagingPlan(session.tenantId)" in route
        assert "rateLimit(" in route
    assert "findAccessibleInboxConversation(session, ctx.params.id)" in read(f"{BASE}/upload/route.ts")
    assert "pauseConversationAi(" in read(f"{BASE}/route.ts")


def test_file_is_checked_before_sending_without_r2():
    lib = read("lib/inbox/outbound-file.ts")
    assert "fileMatchesType(bytes,check.mimeType)" in lib
    assert "bytes.byteLength!==check.sizeBytes" in lib
    assert "requestedByUserId:input.userId" in lib
    assert "size>check.sizeBytes" in lib
    for forbidden in ("createAttachmentUploadUrl","resolveAttachmentStorage","chatAttachment","deleteAttachmentObject","readAttachmentObject"):
        assert forbidden not in lib
    route=read(f"{BASE}/route.ts")
    assert route.index("findAccessibleInboxConversation(session,ctx.params.id)") < route.index("body:req.body")
    assert "x-idempotency-key" in route
    assert "createAttachmentUploadUrl" not in read(f"{BASE}/upload/route.ts")
    inbox=read("app/(app)/inbox/inbox-client.tsx")
    assert "upload.uploadUrl" not in inbox
    assert "body:file" in inbox
    assert "onSend(file,key.current)" in read("components/inbox/file-attach-button.tsx")

def test_person_send_checks_the_requester_like_text_and_audio():
    outbound = read("lib/meta/whatsapp-outbound.ts")
    start = outbound.index("export async function enqueueAndDispatchWhatsAppFileMessage")
    body = outbound[start:start + 800]
    assert "assertRequesterCanSend(" in body
    assert "{ type: 'image', image: { id: input.document.id } }" in outbound
    assert "{ type: 'video', video: { id: input.document.id } }" in outbound


def test_inbox_has_the_attach_button():
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "<FileAttachButton" in inbox
    assert "/messages/whatsapp-file" in inbox
