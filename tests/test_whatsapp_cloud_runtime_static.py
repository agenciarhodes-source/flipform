from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_public_whatsapp_webhook_verifies_challenge_and_raw_body_signature_before_json_parse():
    route = read('app/api/webhooks/meta/whatsapp/route.ts')
    runtime = read('lib/meta/whatsapp-runtime.ts')

    assert "getWhatsAppWebhookVerifyToken" in route
    assert "hub.mode" in route
    assert "hub.verify_token" in route
    assert "hub.challenge" in route
    assert "await req.text()" in route
    assert "x-hub-signature-256" in route
    assert route.index("verifyWhatsAppWebhookSignature") < route.index("JSON.parse(rawBody)")
    assert "createHmac('sha256', appSecret)" in runtime
    assert "timingSafeEqual" in runtime
    assert "signatureHeader?.startsWith('sha256=')" in runtime


def test_webhook_tenant_is_resolved_from_bound_phone_number_not_payload_tenant_id():
    runtime = read('lib/meta/whatsapp-runtime.ts')

    resolver = runtime.split('async function resolveConnectedWhatsAppTenant', 1)[1].split('export async function applyWhatsAppMessageStatus', 1)[0]
    processor = runtime.split('export async function processWhatsAppCloudWebhook', 1)[1].split('export async function sendWhatsAppTextMessage', 1)[0]
    assert "where: { phoneNumberId }" in resolver
    assert "connection.status !== 'connected'" in resolver
    assert "value?.metadata?.phone_number_id" in processor
    assert "tenantId: connection.tenantId" in processor
    assert "payload.tenantId" not in processor
    assert "value.tenantId" not in processor


def test_inbound_messages_use_conversation_core_and_database_idempotency():
    runtime = read('lib/meta/whatsapp-runtime.ts')
    assert "recordInboundMessage({" in runtime
    assert "externalMessageId: message.id" in runtime
    assert "externalUserId: message.from" in runtime
    assert "channel: 'whatsapp'" in runtime
    assert "provider: 'meta'" in runtime
    assert "if (persisted.duplicate)" in runtime
    assert "phone: message.from" in runtime


def test_status_updates_are_tenant_scoped_and_never_downgrade_delivered_or_read():
    runtime = read('lib/meta/whatsapp-runtime.ts')
    status = runtime.split('export async function applyWhatsAppMessageStatus', 1)[1].split('export async function processWhatsAppCloudWebhook', 1)[0]

    assert "tenantId: input.tenantId" in status
    assert "externalMessageId: input.externalMessageId" in status
    assert "channel: 'whatsapp'" in status
    assert "provider: 'meta'" in status
    assert "message.status === 'delivered' || message.status === 'read'" in status
    assert "nextRank <= currentRank" in status


def test_cloud_send_derives_phone_number_and_recipient_from_tenant_data():
    runtime = read('lib/meta/whatsapp-runtime.ts')
    sender = runtime.split('export async function sendWhatsAppTextMessage', 1)[1]

    assert "tenantId: input.tenantId" in sender
    assert "channel: 'whatsapp'" in sender
    assert "status: 'connected'" in sender
    assert "connection.phoneNumberId}/messages" in sender
    assert "to: conversation.externalContactIdentity.externalUserId" in sender
    assert "Authorization: `Bearer ${credentials.systemUserAccessToken}`" in sender
    assert "appsecret_proof" in sender
    assert "input.phoneNumberId" not in sender
    assert "input.accessToken" not in sender


def test_sender_membership_is_validated_before_meta_send():
    runtime = read('lib/meta/whatsapp-runtime.ts')
    sender = runtime.split('export async function sendWhatsAppTextMessage', 1)[1]
    membership_pos = sender.index('prisma.tenantUser.findFirst')
    fetch_pos = sender.index('response = await fetch')
    assert membership_pos < fetch_pos
    assert "status: 'active'" in sender


def test_outbound_message_is_persisted_and_existing_tracking_hook_is_preserved():
    runtime = read('lib/meta/whatsapp-runtime.ts')
    sender = runtime.split('export async function sendWhatsAppTextMessage', 1)[1]
    assert "recordOutboundMessage({" in sender
    assert "externalMessageId" in sender
    assert "status: 'sent'" in sender
    assert "processWhatsAppFunnelMessage({" in sender
    assert "senderType: input.sentByUserId ? 'agent' : 'system'" in sender


def test_runtime_credentials_are_server_only_and_least_privilege():
    credentials = read('lib/meta/whatsapp-runtime-credentials.ts')
    assert "import 'server-only'" in credentials
    assert "appSecretEncrypted: true" in credentials
    assert "whatsappSystemUserAccessTokenEncrypted: true" in credentials
    assert "whatsappAdminSystemUserAccessTokenEncrypted" not in credentials
    assert "decryptIntegrationSecret" in credentials
    assert "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN" in credentials


def test_existing_internal_whatsapp_tracking_webhook_remains_separate_and_protected():
    internal_route = read('app/api/webhooks/whatsapp/message/route.ts')
    assert "INTERNAL_JOB_SECRET" in internal_route
    assert "x-internal-token" in internal_route
    assert "processWhatsAppFunnelMessage" in internal_route


def test_pr_adds_no_destructive_database_migration():
    runtime = read('lib/meta/whatsapp-runtime.ts')
    route = read('app/api/webhooks/meta/whatsapp/route.ts')
    combined = (runtime + route).upper()
    for destructive in ('TRUNCATE ', 'DROP TABLE', 'DELETE FROM LEADS', 'UPDATE LEADS SET'):
        assert destructive not in combined
