from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = 'prisma/migrations/20260816090000_add_conversation_core/migration.sql'


def read(path: str) -> str:
    return (ROOT / path).read_text()


def model(schema: str, name: str) -> str:
    return schema.split(f'model {name} {{', 1)[1].split('\n}', 1)[0]


def test_conversation_core_models_are_tenant_scoped_and_lead_optional():
    schema = read('prisma/schema.prisma')
    identity = model(schema, 'ExternalContactIdentity')
    conversation = model(schema, 'Conversation')
    message = model(schema, 'Message')

    assert 'tenantId' in identity
    assert 'tenantId' in conversation
    assert 'tenantId' in message
    assert 'leadId' in identity and 'String?' in identity.split('leadId', 1)[1].split('\n', 1)[0]
    assert 'leadId' in conversation and 'String?' in conversation.split('leadId', 1)[1].split('\n', 1)[0]
    assert 'tenant_provider_channel_external_user' in identity
    assert 'tenant_provider_channel_identity' in conversation
    assert '@@map("external_contact_identities")' in identity
    assert '@@map("conversations")' in conversation
    assert '@@map("messages")' in message


def test_external_ids_are_tenant_scoped_and_message_id_is_mandatory():
    schema = read('prisma/schema.prisma')
    identity = model(schema, 'ExternalContactIdentity')
    message = model(schema, 'Message')

    external_user_line = next(line for line in identity.splitlines() if 'externalUserId' in line)
    external_message_line = next(line for line in message.splitlines() if 'externalMessageId' in line)
    assert '@unique' not in external_user_line
    assert '@unique' not in external_message_line
    assert 'String?' not in external_message_line
    assert '@@unique([tenantId, provider, channel, externalUserId]' in identity
    assert '@@unique([tenantId, provider, channel, externalMessageId]' in message


def test_conversation_core_migration_is_additive_only():
    migration = read(MIGRATION)
    upper = migration.upper()
    assert 'CREATE TABLE "EXTERNAL_CONTACT_IDENTITIES"' in upper
    assert 'CREATE TABLE "CONVERSATIONS"' in upper
    assert 'CREATE TABLE "MESSAGES"' in upper
    assert '"EXTERNAL_MESSAGE_ID" TEXT NOT NULL' in upper
    assert 'CREATE UNIQUE INDEX "MESSAGE_TENANT_CHANNEL_EXTERNAL_ID_KEY"' in upper

    for destructive in ('DROP TABLE', 'DROP COLUMN', 'DELETE FROM', 'TRUNCATE', 'UPDATE "', 'UPDATE PUBLIC.', 'INSERT INTO "LEADS"', 'INSERT INTO LEADS'):
        assert destructive not in upper


def test_message_idempotency_is_database_backed_and_service_handles_races():
    service = read('lib/conversations/core.ts')
    migration = read(MIGRATION)

    assert 'externalMessageId' in service
    assert "error.code === 'P2002'" in service
    assert 'getExistingInboundMessage' in service
    assert 'duplicate: true as const' in service
    assert 'message_tenant_channel_external_id_key' in migration
    assert 'prisma.$transaction' in service


def test_first_inbound_message_resolves_identity_conversation_and_message_atomically():
    service = read('lib/conversations/core.ts')
    transaction = service.split('return await prisma.$transaction', 1)[1].split('});\n  } catch', 1)[0]
    assert 'tx.externalContactIdentity.upsert' in transaction
    assert 'tx.conversation.upsert' in transaction
    assert 'tx.message.create' in transaction
    assert 'tx.conversation.update' in transaction
    assert 'unreadCount: { increment: 1 }' in transaction


def test_services_scope_crm_links_and_assignments_by_tenant():
    service = read('lib/conversations/core.ts')
    assert "tx.conversation.findFirst({ where: { id: conversationId, tenantId } })" in service
    assert "tx.lead.findFirst({ where: { id: leadId, tenantId }" in service
    assert "where: { tenantId, userId: input.userId, status: 'active' }" in service
    assert "where: { id: conversationId, tenantId }" in service
    assert 'createLead' not in service


def test_conversation_core_has_no_meta_credentials_or_channel_connection_dependency():
    service = read('lib/conversations/core.ts')
    forbidden = (
        'TenantMetaConnection',
        'TenantWhatsAppConnection',
        'PlatformMetaSettings',
        'accessTokenEncrypted',
        'appSecret',
        'systemUserAccessToken',
        'wabaId',
        'phoneNumberId',
    )
    for value in forbidden:
        assert value not in service


def test_core_is_prepared_for_whatsapp_and_instagram_without_provider_specific_http():
    service = read('lib/conversations/core.ts')
    assert "'whatsapp' | 'instagram'" in service
    assert "ConversationProvider = 'meta'" in service
    assert 'fetch(' not in service
    assert 'graph.facebook.com' not in service
    assert 'axios' not in service
