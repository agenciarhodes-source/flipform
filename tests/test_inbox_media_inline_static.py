from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_small_files_are_served_by_flipform_with_ranges():
    route = read("app/api/inbox/messages/[id]/media/route.ts")
    assert "copy.sizeBytes <= SERVE_INLINE_MAX_BYTES" in route
    assert "readAttachmentObject(storage.config, { key: copy.objectKey, maxBytes: SERVE_INLINE_MAX_BYTES })" in route
    assert "'Accept-Ranges': 'bytes'" in route
    assert "status: range ? 206 : 200" in route
    # Access stays the same: only who may see the conversation.
    assert "withPermission('INBOX_VIEW'" in route
    assert "findAccessibleInboxConversation(session, message.conversationId)" in route


def test_audio_that_does_not_play_offers_the_download():
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "Este navegador não conseguiu tocar o áudio" in inbox
