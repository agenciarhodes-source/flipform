from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_instagram_send_endpoint_is_tenant_scoped_and_permission_protected():
    route = read('app/api/conversations/[id]/messages/instagram/route.ts')
    outbound = read('lib/meta/instagram-outbound.ts')

    assert "withPermission('INBOX_MANAGE'" in route
    assert 'session.tenantId' in route
    assert 'session.userId' in route
    assert 'ctx.params.id' in route
    assert "channel: 'instagram'" in outbound
    assert "provider: 'meta'" in outbound
    assert "membership.role === 'agent'" in outbound
    assert 'ownsConversation' in outbound
    assert 'ownsLead' in outbound


def test_customer_must_have_started_instagram_conversation():
    outbound = read('lib/meta/instagram-outbound.ts')
    assert 'conversation.lastInboundAt' in outbound
    assert "RECIPIENT_NOT_ELIGIBLE" in outbound
    assert 'externalContactIdentity.externalUserId' in outbound


def test_instagram_outbox_is_persisted_before_meta_send_and_idempotent():
    outbound = read('lib/meta/instagram-outbound.ts')

    create_pos = outbound.index('const message = await prisma.message.create')
    send_pos = outbound.index('async function sendInstagramText')
    assert create_pos < send_pos
    assert "const OUTBOX_PREFIX = 'local.instagram.'" in outbound
    assert 'idempotencyKeyHash' in outbound
    assert 'requestFingerprint' in outbound
    assert "dispatchState: 'queued'" in outbound
    assert 'FOR UPDATE' in outbound
    assert "dispatchState === 'sending'" in outbound
    assert "dispatchState === 'delivery_unknown'" in outbound
    assert 'IDEMPOTENCY_CONFLICT' in outbound


def test_stale_sending_attempt_becomes_delivery_unknown_without_resend():
    outbound = read('lib/meta/instagram-outbound.ts')
    begin = outbound.split('async function beginDispatch', 1)[1].split('async function markDeliveryUnknown', 1)[0]

    assert 'SENDING_LEASE_MS' in outbound
    assert 'sendingAttemptIsStale' in outbound
    assert "metadata.dispatchState === 'sending'" in begin
    assert "if (!sendingAttemptIsStale(metadata)) return { action: 'in_progress'" in begin
    assert "dispatchState: 'delivery_unknown'" in begin
    assert "return { action: 'delivery_unknown'" in begin
    assert 'sendInstagramText' not in begin


def test_existing_idempotent_result_is_resolved_before_live_connection_requirement():
    outbound = read('lib/meta/instagram-outbound.ts')
    enqueue = outbound.split('async function enqueueInstagramTextMessage', 1)[1].split('type LockedOutbox', 1)[0]

    existing_pos = enqueue.index('const existing = await findExistingOutboxMessage')
    connection_pos = enqueue.index('const connection = await getInstagramSendConnection')
    assert existing_pos < connection_pos
    assert "return { message: existing, metadata, created: false as const }" in enqueue


def test_new_send_matches_conversation_originating_professional_account():
    route = read('app/api/conversations/[id]/messages/instagram/route.ts')
    outbound = read('lib/meta/instagram-outbound.ts')

    assert 'getConversationInstagramProfessionalAccountId' in outbound
    assert "direction: 'inbound'" in outbound
    assert 'metadata.instagramProfessionalAccountId' in outbound
    assert 'originInstagramUserId !== connection.instagramUserId' in outbound
    assert "ACCOUNT_MISMATCH" in outbound
    assert "error.code === 'ACCOUNT_MISMATCH'" in route


def test_instagram_send_uses_official_graph_endpoint_and_server_derived_assets():
    outbound = read('lib/meta/instagram-outbound.ts')
    credentials = read('lib/meta/instagram-send-credentials.ts')

    assert 'https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/' in outbound
    assert '/messages`' in outbound
    assert 'recipient: { id: input.recipientIgScopedId }' in outbound
    assert 'message: { text: input.text }' in outbound
    assert 'Authorization: `Bearer ${input.accessToken}`' in outbound
    assert 'payload.message_id' in outbound
    assert 'instagramUserId: connection.instagramUserId' in outbound
    assert 'recipientIgScopedId: dispatch.metadata.recipientIgScopedId' in outbound
    assert 'req.body.instagramUserId' not in outbound
    assert 'req.body.recipient' not in outbound

    assert "import 'server-only'" in credentials
    assert 'accessTokenEncrypted: true' in credentials
    assert 'decryptIntegrationSecret' in credentials
    assert "INSTAGRAM_WEBHOOK_SUBSCRIBED" in credentials
    assert 'tokenExpiresAt' in credentials


def test_ambiguous_provider_outcome_is_never_blindly_retried():
    outbound = read('lib/meta/instagram-outbound.ts')
    assert "return { kind: 'unknown' }" in outbound
    assert 'raw = await response.text()' in outbound
    assert "dispatchState: 'delivery_unknown'" in outbound
    assert "return { action: 'delivery_unknown'" in outbound
    assert "return { action: 'in_progress'" in outbound


def test_provider_acceptance_is_saved_before_conversation_activity_finalization():
    outbound = read('lib/meta/instagram-outbound.ts')
    acceptance = outbound.index('await persistProviderAcceptance({')
    finalize = outbound.index('const metadata = await finalizeAcceptedMessage({', acceptance)
    assert acceptance < finalize
    assert 'providerMessageId: input.providerMessageId' in outbound
    assert 'providerAcceptedAt' in outbound
    assert 'lastOutboundAt' in outbound
    assert 'lastMessageAt' in outbound


def test_pr203_adds_no_destructive_customer_data_operations():
    combined = (
        read('lib/meta/instagram-outbound.ts')
        + read('lib/meta/instagram-send-credentials.ts')
        + read('app/api/conversations/[id]/messages/instagram/route.ts')
    ).upper()
    for destructive in ('TRUNCATE ', 'DROP TABLE', 'DELETE FROM LEADS', 'UPDATE LEADS SET'):
        assert destructive not in combined
