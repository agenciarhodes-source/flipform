from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_settings_table_is_additive_and_starts_off():
    sql = read("prisma/migrations/20261104120000_instagram_ai_settings/migration.sql")
    assert 'CREATE TABLE IF NOT EXISTS "tenant_instagram_ai_settings"' in sql
    assert '"enabled" BOOLEAN NOT NULL DEFAULT false' in sql
    assert '"live_enabled" BOOLEAN NOT NULL DEFAULT false' in sql
    # Only the table and its index are created ("ON DELETE/UPDATE CASCADE" are link rules, not commands).
    commands = sql.upper().replace("ON DELETE CASCADE", "").replace("ON UPDATE CASCADE", "").replace("ON DELETE SET NULL", "")
    for forbidden in ["DROP ", "ALTER TABLE", "DELETE ", "UPDATE ", "INSERT "]:
        assert forbidden not in commands, forbidden


def test_settings_are_managed_only_by_who_manages_the_ai():
    route = read("app/api/instagram-ai/settings/route.ts")
    assert route.count("withPermission('FLIP_AI_MANAGE'") == 2
    settings = read("lib/instagram-ai/settings.ts")
    assert "where: { id: input.connectionId, tenantId: access.tenantId, status: 'connected' }" in settings
    assert "where: { id: input.agentId, tenantId: access.tenantId, status: 'published' }" in settings
    assert "action: 'instagram_ai.settings_updated'" in settings


def test_only_the_ai_may_send_without_a_person_and_only_after_the_customer_wrote():
    outbound = read("lib/meta/instagram-outbound.ts")
    assert "(!requestedByUserId && !aiSender)" in outbound
    assert "? await loadConversationForAi({ tenantId, conversationId })" in outbound
    assert ": await assertRequesterCanSend({ tenantId, userId: requestedByUserId, conversationId });" in outbound
    block = outbound.split("async function loadConversationForAi")[1].split("async function enqueueInstagramTextMessage")[0]
    assert "tenantId: input.tenantId, provider: 'meta', channel: 'instagram'" in block
    assert "if (!conversation.lastInboundAt)" in block
    assert "sentByUserId: aiSender ? null : requestedByUserId" in outbound


def test_a_team_reply_on_instagram_pauses_the_ai():
    route = read("app/api/conversations/[id]/messages/instagram/route.ts")
    assert "reason: 'human_reply_system'" in route
    inbox = read("app/api/inbox/conversations/[id]/ai/route.ts")
    assert "conversation.channel !== 'instagram'" in inbox
