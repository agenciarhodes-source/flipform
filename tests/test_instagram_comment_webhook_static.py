from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_instagram_comment_permission_is_requested_with_business_login():
    onboarding = read('lib/meta/onboarding.ts')
    instagram = read('lib/meta/instagram.ts')

    assert "'instagram_business_manage_comments'" in onboarding
    assert "'instagram_business_manage_messages'" in onboarding
    assert "'instagram_business_basic'" in onboarding
    assert 'INSTAGRAM_REQUIRED_SCOPES.join' in instagram


def test_instagram_comment_webhook_accepts_direct_and_changes_payload_shapes():
    runtime = read('lib/meta/instagram-webhook-runtime.ts')

    assert "INSTAGRAM_COMMENT_FIELDS = ['comments', 'live_comments'] as const" in runtime
    assert 'entry?.field' in runtime
    assert 'entry?.value' in runtime
    assert 'Array.isArray(entry?.changes)' in runtime
    assert 'change?.field' in runtime
    assert 'change?.value' in runtime
    assert 'commenterInstagramScopedId = stringId(input.value?.from?.id)' in runtime
    assert 'commenterUsername' in runtime
    assert 'mediaProductType' in runtime


def test_instagram_comment_timestamps_accept_seconds_or_milliseconds():
    runtime = read('lib/meta/instagram-webhook-runtime.ts')

    assert 'numeric < 100_000_000_000 ? numeric * 1000 : numeric' in runtime
    assert 'const occurredAt = providerTimestamp(input.entryTime)' in runtime
    assert 'providerTimestamp(event?.timestamp)' in runtime


def test_instagram_comments_are_tenant_safe_idempotent_and_do_not_create_conversations():
    runtime = read('lib/meta/instagram-webhook-runtime.ts')

    assert "INSTAGRAM_COMMENT_EVENT_PROVIDER = 'instagram_comment'" in runtime
    assert 'provider: INSTAGRAM_COMMENT_EVENT_PROVIDER' in runtime
    assert 'eventId = `${input.instagramProfessionalAccountId}:${input.comment.commentId}`' in runtime
    assert 'tenantId: input.tenantId' in runtime
    assert 'processedAt: new Date()' in runtime
    assert "error.code === 'P2002'" in runtime
    assert 'recordInboundMessage({' in runtime  # Direct messages still use the conversation core.
    assert 'payload.tenantId' not in runtime
    assert 'entry.tenantId' not in runtime

    comment_segment = runtime.split('async function persistInstagramCommentEvent', 1)[1].split('export async function processInstagramWebhook', 1)[0]
    assert 'prisma.webhookEvent.create' in comment_segment
    assert 'prisma.conversation' not in comment_segment
    assert 'recordInboundMessage' not in comment_segment


def test_comment_ingestion_requires_current_subscription_and_skips_self_comments():
    runtime = read('lib/meta/instagram-webhook-runtime.ts')

    assert 'connection.webhookFields.includes(change.field)' in runtime
    assert 'commenterInstagramScopedId === input.instagramProfessionalAccountId' in runtime
    assert 'Boolean(selfInstagramScopedId)' in runtime
    assert 'result.selfComments += 1' in runtime
    assert 'result.commentDuplicates += 1' in runtime
    assert 'result.comments += 1' in runtime


def test_comment_foundation_has_no_schema_or_destructive_customer_mutation():
    paths = [
        'lib/meta/onboarding.ts',
        'lib/meta/instagram.ts',
        'lib/meta/instagram-connection.ts',
        'lib/meta/instagram-webhook-runtime.ts',
        'app/api/integrations/instagram/callback/route.ts',
    ]
    combined = '\n'.join(read(path) for path in paths).upper()

    for destructive in ('TRUNCATE ', 'DROP TABLE', 'DELETE FROM LEADS', 'UPDATE LEADS SET'):
        assert destructive not in combined
    assert not (ROOT / 'prisma/migrations/20260817_instagram_comments').exists()
