from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_public_whatsapp_webhook_verifies_challenge_and_raw_body_signature_before_json_parse():
    route = read('app/api/webhooks/meta/whatsapp/route.ts')
    runtime = read('lib/meta/whatsapp-runtime.ts')

    assert 'getWhatsAppWebhookVerifyToken' in route
    assert 'hub.mode' in route
    assert 'hub.verify_token' in route
    assert 'hub.challenge' in route
    assert 'await req.text()' in route
    assert 'x-hub-signature-256' in route
    call_pos = route.index('if (!verifyWhatsAppWebhookSignature')
    parse_pos = route.index('JSON.parse(rawBody)')
    assert call_pos < parse_pos
    assert "createHmac('sha256', appSecret)" in runtime
    assert 'timingSafeEqual' in runtime
    assert "signatureHeader?.startsWith('sha256=')" in runtime


def test_webhook_tenant_is_resolved_from_bound_phone_number_not_payload_tenant_id():
    runtime = read('lib/meta/whatsapp-runtime.ts')

    resolver = runtime.split('async function resolveConnectedWhatsAppTenant', 1)[1].split('export async function applyWhatsAppMessageStatus', 1)[0]
    processor = runtime.split('export async function processWhatsAppCloudWebhook', 1)[1]
    assert 'where: { phoneNumberId }' in resolver
    assert "connection.status !== 'connected'" in resolver
    assert 'value?.metadata?.phone_number_id' in processor
    assert 'tenantId: connection.tenantId' in processor
    assert 'payload.tenantId' not in processor
    assert 'value.tenantId' not in processor


def test_inbound_messages_use_conversation_core_and_database_idempotency():
    runtime = read('lib/meta/whatsapp-runtime.ts')
    assert 'recordInboundMessage({' in runtime
    assert 'externalMessageId: message.id' in runtime
    assert 'externalUserId: message.from' in runtime
    assert "channel: 'whatsapp'" in runtime
    assert "provider: 'meta'" in runtime
    assert 'if (persisted.duplicate)' in runtime
    assert 'phone: message.from' in runtime


def test_status_updates_are_serialized_tenant_scoped_and_monotonic():
    runtime = read('lib/meta/whatsapp-runtime.ts')
    status = runtime.split('export async function applyWhatsAppMessageStatus', 1)[1].split('export async function processWhatsAppCloudWebhook', 1)[0]

    assert 'tx.$queryRaw' in status
    assert 'FROM public.messages' in status
    assert 'tenant_id = ${input.tenantId}' in status
    assert "provider = 'meta'" in status
    assert "channel = 'whatsapp'" in status
    assert 'external_message_id = ${input.externalMessageId}' in status
    assert 'FOR UPDATE' in status
    assert "message.status === 'delivered' || message.status === 'read'" in status
    assert 'nextRank <= currentRank' in status


def test_webhook_credentials_are_server_only_and_do_not_load_runtime_or_admin_tokens():
    credentials = read('lib/meta/whatsapp-runtime-credentials.ts')
    route = read('app/api/webhooks/meta/whatsapp/route.ts')

    assert "import 'server-only'" in credentials
    assert 'appSecretEncrypted: true' in credentials
    assert 'decryptIntegrationSecret' in credentials
    assert 'META_WHATSAPP_WEBHOOK_VERIFY_TOKEN' in credentials
    assert 'whatsappSystemUserAccessTokenEncrypted' not in credentials
    assert 'whatsappAdminSystemUserAccessTokenEncrypted' not in credentials
    assert 'systemUserAccessToken' not in credentials
    assert 'getPlatformWhatsAppWebhookCredentials' in route


def test_outbound_send_is_deliberately_not_exposed_until_durable_outbox_exists():
    runtime = read('lib/meta/whatsapp-runtime.ts')
    route = read('app/api/webhooks/meta/whatsapp/route.ts')
    assert 'sendWhatsAppTextMessage' not in runtime
    assert '/messages`' not in runtime
    assert 'Authorization: `Bearer' not in runtime
    assert 'sentByUserId' not in route


def test_existing_internal_whatsapp_tracking_webhook_remains_separate_and_protected():
    internal_route = read('app/api/webhooks/whatsapp/message/route.ts')
    assert 'INTERNAL_JOB_SECRET' in internal_route
    assert 'x-internal-token' in internal_route
    assert 'processWhatsAppFunnelMessage' in internal_route


def test_pr_adds_no_destructive_database_migration():
    runtime = read('lib/meta/whatsapp-runtime.ts')
    route = read('app/api/webhooks/meta/whatsapp/route.ts')
    combined = (runtime + route).upper()
    for destructive in ('TRUNCATE ', 'DROP TABLE', 'DELETE FROM LEADS', 'UPDATE LEADS SET'):
        assert destructive not in combined
