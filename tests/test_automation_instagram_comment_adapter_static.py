from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_adapter_uses_generic_core_for_new_runtime_with_legacy_drain_preserved():
    adapter = read('lib/automation/adapters/instagram-comment.ts')
    runtime = read('lib/meta/instagram-webhook-runtime.ts')
    webhook = read('app/api/webhooks/meta/instagram/route.ts')

    assert "INSTAGRAM_COMMENT_KEYWORD_TRIGGER = 'instagram.comment.keyword'" in adapter
    assert "INSTAGRAM_PRIVATE_REPLY_ACTION = 'instagram.private_reply'" in adapter
    assert 'listEnabledAutomationDefinitionsByTrigger' in adapter
    assert 'enqueueAutomationExecution' in adapter
    assert 'normalizeInstagramCommentAutomationText' in adapter
    assert 'instagramCommentAutomationMatches' in adapter

    assert 'enqueueInstagramCommentCoreAutomation' in runtime
    assert 'createInstagramCommentAutomationJob' not in runtime
    assert 'drainAutomationExecutionQueue' in webhook
    assert 'drainInstagramCommentAutomationQueue' in webhook


def test_adapter_keeps_source_event_and_definition_version_inside_core_contract():
    adapter = read('lib/automation/adapters/instagram-comment.ts')

    assert 'sourceEventKey' in adapter
    assert 'sourceCommentEventId' in adapter
    assert 'definition: input.prepared.definition' in adapter
    assert 'executionInput:' in adapter
    assert 'tenantId' in adapter


def test_private_reply_handler_reuses_safe_existing_dispatcher():
    handler = read('lib/automation/handlers/instagram-private-reply.ts')

    assert 'enqueueAndDispatchInstagramPrivateReply' in handler
    assert "can(preferred.role, 'INTEGRATIONS_EDIT')" in handler
    assert "can(membership.role, 'INTEGRATIONS_EDIT')" in handler
    assert 'idempotencyKey: context.idempotencyKey' in handler
    assert "result.status === 'delivery_unknown'" in handler
    assert "result.status === 'in_progress'" in handler
    assert "error.code === 'ALREADY_REPLIED'" in handler


def test_adapter_and_handler_do_not_touch_crm_or_expose_secrets():
    paths = [
        'lib/automation/adapters/instagram-comment.ts',
        'lib/automation/handlers/instagram-private-reply.ts',
    ]
    combined = '\n'.join(read(path) for path in paths)

    for forbidden in (
        '/api/leads',
        '/api/kanban',
        'Lead',
        'Pipeline',
        'Conversation',
        'Message',
        'accessToken',
        'appSecret',
        'clientSecret',
    ):
        assert forbidden not in combined


def test_core_index_exports_instagram_bridge_explicitly():
    index = read('lib/automation/index.ts')

    assert 'prepareInstagramCommentCoreAutomation' in index
    assert 'enqueueInstagramCommentCoreAutomation' in index
    assert 'createInstagramPrivateReplyAutomationHandler' in index
    assert 'INSTAGRAM_COMMENT_KEYWORD_TRIGGER' in index
    assert 'INSTAGRAM_PRIVATE_REPLY_ACTION' in index
