"""Several WhatsApp numbers in one company: connecting another number never disconnects the others,
every received message records its number, sends go through the conversation's number, and the
migration never leaves conversations without a uniqueness rule."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_adding_a_number_keeps_the_others_connected():
    source = read("app/api/integrations/whatsapp/embedded-signup/complete/route.ts")
    assert "addNumber: z.boolean().optional()" in source
    assert "if (!addNumber) {" in source
    assert "excludePhoneNumberIds: alreadyConnected" in source


def test_received_messages_record_their_number():
    source = read("lib/meta/whatsapp-runtime.ts")
    assert source.count("whatsappConnectionId: connection.id") == 2


def test_sends_use_the_conversation_number():
    source = read("lib/meta/whatsapp-outbound.ts")
    assert "await resolveConnectedWhatsAppConnection(tenantId, conversationId)" in source
    assert source.count("await numberForSend(tenantId, input.conversationId.trim())") == 3
    assert "where: { tenantId, status: 'connected' },\n      orderBy" not in source


def test_conversation_per_contact_per_number():
    source = read("lib/conversations/core.ts")
    assert "tenant_provider_channel_identity" not in source
    assert source.count("findOrCreateConversation(tx, {") == 2


def test_migration_creates_the_new_rule_before_dropping_the_old():
    sql = read("prisma/migrations/20261119120000_whatsapp_multi_number/migration.sql")
    new_rule = sql.index('CREATE UNIQUE INDEX IF NOT EXISTS "conversation_tenant_channel_identity_number_key"')
    old_rule = sql.index('DROP INDEX IF EXISTS "conversation_tenant_channel_identity_key"')
    assert new_rule < old_rule
    statements = [line.strip().upper() for line in sql.splitlines() if line.strip() and not line.strip().startswith("--")]
    for word in ("DROP TABLE", "DROP COLUMN", "DELETE ", "UPDATE ", "TRUNCATE"):
        assert not any(line.startswith(word) for line in statements), word
