from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_media_is_served_only_to_who_sees_the_conversation_and_never_stored():
    route = read("app/api/inbox/messages/[id]/media/route.ts")
    assert "withPermission('INBOX_VIEW'" in route
    assert "findAccessibleInboxConversation(session, message.conversationId)" in route
    assert "where: { id: ctx.params.id, tenantId: session.tenantId, provider: 'meta', channel: 'whatsapp' }," in route
    for write in (".create(", ".update(", "upload", "putObject"):
        assert write not in route
    media = read("lib/meta/whatsapp-media.ts")
    assert "Authorization: `Bearer ${input.accessToken}`" in media
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "<MessageMedia message={message} outbound={outbound} />" in inbox
    runtime = read("lib/meta/whatsapp-runtime.ts")
    assert "mediaFileName: media.filename.slice(0, 200)" in runtime
