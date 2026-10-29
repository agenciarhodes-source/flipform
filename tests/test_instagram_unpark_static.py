from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_inbox_reports_the_instagram_ai_and_who_it_answers():
    route = read("app/api/inbox/conversations/route.ts")
    assert "const instagramAi = await isInstagramAiEnabledForTenant(session.tenantId);" in route
    assert "conversation.channel === 'instagram' && instagramAiAnswers(conversation.externalContactIdentity.username)" in route
    assert "return NextResponse.json({ conversations, whatsappAi, instagramAi });" in route
    audience = read("lib/instagram-ai/audience.ts")
    assert "where: { tenantId, enabled: true, agentId: { not: null }, connection: { status: 'connected' } }" in audience


def test_ai_status_follows_the_channel_of_the_conversation():
    client = read("app/(app)/inbox/inbox-client.tsx")
    assert "conversation.channel === 'instagram' ? instagramAi" in client
    assert "resumeAfterHours={channelAi(selected).resumeAfterHours}" in client
