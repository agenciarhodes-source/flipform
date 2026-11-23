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


def test_file_is_checked_before_sending_and_bound_to_the_person():
    lib = read("lib/inbox/outbound-file.ts")
    assert "sessionRef: sessionRefOf(input.userId)" in lib
    assert "fileMatchesType(bytes, row.mimeType)" in lib
    assert "bytes.byteLength !== row.sizeBytes" in lib
    assert "deleteAttachmentObject(" in lib


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
