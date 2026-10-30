from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_webhook_keeps_only_a_checked_meta_photo_address():
    runtime = read("lib/meta/instagram-webhook-runtime.ts")
    assert "const mediaUrl = type === 'image' ? instagramMediaUrl(attachments[0]?.payload?.url) : null;" in runtime
    assert "...(mediaUrl ? { mediaUrl } : {})," in runtime


def test_reply_reads_photos_with_limits_and_without_personal_numbers():
    reply = read("lib/instagram-ai/reply.ts")
    assert "imagesRead < 3" in reply
    assert "notes.push(instagramImageNote(description));" in reply
    image = read("lib/instagram-ai/image.ts")
    assert "redirect: 'manual'" in image
    assert "url = next ? instagramMediaUrl(new URL(next, url).toString()) : null;" in image
    assert "MAX_IMAGE_BYTES = 8 * 1024 * 1024" in image
    assert "const url = instagramMediaUrl(metadata.mediaUrl);" in image
    assert "Nunca transcreva números de CPF, RG" in image
    assert "requestKey: `instagram-image:${input.message.id}`" in image
    assert "imageDescription: description" in image
