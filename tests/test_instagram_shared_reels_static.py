from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_webhook_keeps_the_caption_of_a_shared_reels():
    runtime = read("lib/meta/instagram-webhook-runtime.ts")
    assert "instagramShareKind(attachmentTypes[0])" in runtime
    assert "instagramShareTitle(attachments[0]?.payload?.title)" in runtime
    assert "...(sharedTitle ? { sharedTitle } : {})" in runtime


def test_inbox_shows_what_was_shared():
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "instagramShareLabel(shareKind, instagramShareTitle(metadata.sharedTitle))" in inbox
    # share-rules is imported by the browser bundle: it must stay free of server code.
    rules = read("lib/instagram-ai/share-rules.ts")
    assert "import" not in rules.split("*/", 1)[1]


def test_ai_reads_notes_even_without_text_in_the_turn():
    reply = read("lib/instagram-ai/reply.ts")
    assert "instagramShareNote(shareKind, instagramShareTitle(metadata.sharedTitle))" in reply
    assert "messages: notes.length\n" in reply.replace("\r\n", "\n")
    assert "notes.length && parts.length" not in reply
