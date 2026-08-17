from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_public_instagram_webhook_verifies_challenge_and_signature_before_json_parse():
    route = read('app/api/webhooks/meta/instagram/route.ts')
    runtime = read('lib/meta/instagram-webhook-runtime.ts')

    assert 'getInstagramWebhookVerifyToken' in route
    assert 'hub.mode' in route
    assert 'hub.verify_token' in route
    assert 'hub.challenge' in route
    assert 'await req.text()' in route
    assert 'x-hub-signature-256' in route
    assert route.index('if (!verifyInstagramWebhookSignature') < route.index('JSON.parse(rawBody)')
    assert "createHmac('sha256', appSecret)" in runtime
    assert 'timingSafeEqual' in runtime
    assert "signatureHeader?.startsWith('sha256=')" in runtime


def test_instagram_webhook_credentials_are_least_privilege_and_channel_specific():
    credentials = read('lib/meta/instagram-runtime-credentials.ts')

    assert "import 'server-only'" in credentials
    assert 'instagramAppSecretEncrypted: true' in credentials
    assert 'decryptIntegrationSecret' in credentials
    assert 'META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN' in credentials
    assert 'accessTokenEncrypted' not in credentials
    assert 'appSecretEncrypted: true' not in credentials
    assert 'whatsapp' not in credentials.lower()


def test_webhook_resolves_tenant_from_bound_and_webhook_subscribed_instagram_account():
    runtime = read('lib/meta/instagram-webhook-runtime.ts')
    resolver = runtime.split('async function resolveConnectedInstagramTenant', 1)[1].split('function isInstagramCommentField', 1)[0]
    processor = runtime.split('export async function processInstagramWebhook', 1)[1]

    assert 'where: { instagramUserId }' in resolver
    assert "connection.status !== 'connected'" in resolver
    assert 'connection.revokedAt' in resolver
    assert "action: INSTAGRAM_WEBHOOK_SUBSCRIBED_ACTION" in resolver
    assert 'createdAt: { gte: connection.connectedAt }' in resolver
    assert 'if (!webhookSubscription) return null' in resolver
    assert 'webhookFields: subscriptionFields(webhookSubscription.metadata)' in resolver
    assert 'entry?.id' in processor
    assert 'tenantId: connection.tenantId' in processor
    assert 'payload.tenantId' not in processor
    assert 'entry.tenantId' not in processor


def test_inbound_instagram_messages_use_conversation_core_and_skip_business_echoes():
    runtime = read('lib/meta/instagram-webhook-runtime.ts')

    assert "connection.webhookFields.includes('messages')" in runtime
    assert 'recordInboundMessage({' in runtime
    assert "provider: 'meta'" in runtime
    assert "channel: 'instagram'" in runtime
    assert 'externalUserId: senderId' in runtime
    assert 'externalMessageId,' in runtime
    assert 'message?.is_echo === true' in runtime
    assert 'senderId === instagramProfessionalAccountId' in runtime
    assert 'recipientId !== instagramProfessionalAccountId' in runtime
    assert 'if (persisted.duplicate)' in runtime


def test_instagram_connection_subscribes_professional_account_and_marks_subscription_before_reporting_connected():
    helper = read('lib/meta/instagram.ts')
    callback = read('app/api/integrations/instagram/callback/route.ts')
    connection = read('lib/meta/instagram-connection.ts')

    assert '/subscribed_apps`' in helper
    assert "INSTAGRAM_WEBHOOK_FIELDS = ['messages', 'comments', 'live_comments'] as const" in helper
    assert 'subscribed_fields: [...INSTAGRAM_WEBHOOK_FIELDS]' in helper
    assert 'Authorization: `Bearer ${input.accessToken}`' in helper
    assert "'webhook_subscription'" in helper
    subscribe_pos = callback.index('await subscribeInstagramWebhooks')
    persist_pos = callback.index('await persistInstagramConnection')
    assert subscribe_pos < persist_pos
    assert 'webhookFields: INSTAGRAM_WEBHOOK_FIELDS' in callback
    assert "INSTAGRAM_WEBHOOK_SUBSCRIBED_ACTION = 'INSTAGRAM_WEBHOOK_SUBSCRIBED'" in connection
    assert 'fields: [...input.webhookFields]' in connection
    assert "action: INSTAGRAM_WEBHOOK_SUBSCRIBED_ACTION" in connection
    assert "status: 'reconnect_required' as const" in connection


def test_instagram_webhook_foundation_adds_no_schema_or_customer_data_mutation():
    runtime = read('lib/meta/instagram-webhook-runtime.ts')
    route = read('app/api/webhooks/meta/instagram/route.ts')
    callback = read('app/api/integrations/instagram/callback/route.ts')
    combined = (runtime + route + callback).upper()

    for destructive in ('TRUNCATE ', 'DROP TABLE', 'DELETE FROM LEADS', 'UPDATE LEADS SET'):
        assert destructive not in combined
    assert 'prisma.lead.' not in runtime
    assert 'prisma.pipeline' not in runtime
