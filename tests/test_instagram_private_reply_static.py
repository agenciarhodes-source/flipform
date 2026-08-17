from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_private_reply_endpoint_is_tenant_and_server_derived():
    route = read('app/api/integrations/instagram/comments/[eventId]/private-reply/route.ts')

    assert "withPermission(\n  'INTEGRATIONS_EDIT'" in route
    assert 'session.tenantId' in route
    assert 'session.userId' in route
    assert 'ctx.params.eventId' in route
    assert 'text: z.string().trim().min(1).max(4096)' in route
    assert 'idempotencyKey:' in route
    assert '.strict()' in route
    assert 'tenantId:' not in route.split('const bodySchema', 1)[1].split('}).strict()', 1)[0]
    assert 'commentId:' not in route.split('const bodySchema', 1)[1].split('}).strict()', 1)[0]
    assert 'instagramUserId:' not in route.split('const bodySchema', 1)[1].split('}).strict()', 1)[0]
    assert 'accessToken:' not in route


def test_private_reply_uses_persisted_comment_and_current_matching_connection():
    service = read('lib/meta/instagram-private-reply.ts')

    assert "provider: COMMENT_PROVIDER" in service
    assert "provider: PRIVATE_REPLY_PROVIDER" in service
    assert 'tenantId: input.tenantId' in service
    assert 'instagramProfessionalAccountId' in service
    assert 'commentId' in service
    assert 'getInstagramSendConnection' in service
    assert 'connection.instagramUserId !== comment.instagramUserId' in service
    assert "subscriptionFields(marker.metadata).includes('comments')" in service
    assert "action: INSTAGRAM_WEBHOOK_SUBSCRIBED_ACTION" in service


def test_private_reply_enforces_meta_window_and_disables_live_without_proof():
    service = read('lib/meta/instagram-private-reply.ts')

    assert 'PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60_000' in service
    assert "source.eventType === 'live_comments'" in service
    assert "'LIVE_NOT_SUPPORTED'" in service
    assert "source.eventType !== 'comments'" in service
    assert 'ageMs > PRIVATE_REPLY_WINDOW_MS' in service


def test_private_reply_provider_request_uses_comment_id_not_user_id():
    service = read('lib/meta/instagram-private-reply.ts')

    assert 'https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}' in service
    assert 'recipient: { comment_id: input.commentId }' in service
    assert 'message: { text: input.text }' in service
    assert 'Authorization: `Bearer ${input.accessToken}`' in service
    assert "typeof payload.message_id !== 'string'" in service
    assert "typeof payload.recipient_id !== 'string'" in service


def test_private_reply_outbox_is_one_per_comment_and_ambiguous_delivery_never_blindly_retries():
    service = read('lib/meta/instagram-private-reply.ts')

    assert "PRIVATE_REPLY_PROVIDER = 'instagram_private_reply'" in service
    assert 'deterministicProviderEventId' in service
    assert 'providerEventId' in service
    assert "error.code !== 'P2002'" in service
    assert "dispatchState: 'sending'" in service
    assert 'SENDING_LEASE_MS' in service
    assert "dispatchState: 'delivery_unknown'" in service
    assert 'sendingAttemptIsStale' in service
    assert 'releaseDispatchToQueued' in service
    assert "provider.kind === 'unknown'" in service
    assert "state: 'delivery_unknown'" in service
    assert "'ALREADY_REPLIED'" in service
    assert "'IDEMPOTENCY_CONFLICT'" in service


def test_private_reply_mutates_only_its_dedicated_webhook_outbox():
    service = read('lib/meta/instagram-private-reply.ts')
    upper = service.upper()

    assert 'PRISMA.WEBHOOKEVENT.CREATE' in upper
    assert 'TX.WEBHOOKEVENT.UPDATE' in upper
    assert 'PRISMA.LEAD.' not in upper
    assert 'PRISMA.CONVERSATION.' not in upper
    assert 'PRISMA.MESSAGE.' not in upper
    for destructive in ('TRUNCATE ', 'DROP TABLE', 'DELETE FROM LEADS', 'UPDATE LEADS SET'):
        assert destructive not in upper
