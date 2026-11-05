from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8").replace("\r\n", "\n")


def test_tags_get_a_fixed_thank_you_before_the_ai_runs():
    reply = read("lib/instagram-ai/reply.ts")
    thanks = reply.index("pending.every(instagramIsThankOnly)")
    assert thanks < reply.index("const parts: string[] = [];")
    assert "text: INSTAGRAM_TAG_THANKS," in reply
    assert "idempotencyKey: `ig-tag-thanks-${latestInbound.id}`" in reply


def test_off_topic_sends_nothing():
    reply = read("lib/instagram-ai/reply.ts")
    block = reply[reply.index("instagramWantsNoReply(parsed.reply)"):]
    assert block.index("return { replied: false, reason: 'off_topic' }") < block.index("enqueueAndDispatchInstagramTextMessage")
    assert "INSTAGRAM_AI_OFF_TOPIC" in reply


def test_inbox_names_what_instagram_does_not_show():
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "instagramOtherLabel({ type: message.type, text: null, metadata })" in inbox
