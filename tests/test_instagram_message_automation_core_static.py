from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_instagram_dm_adapter_is_keyword_scoped_and_idempotent():
    adapter = read('lib/automation/adapters/instagram-message.ts')

    assert "INSTAGRAM_MESSAGE_KEYWORD_TRIGGER = 'instagram.message.keyword'" in adapter
    assert "INSTAGRAM_SEND_TEXT_ACTION = 'instagram.send_text'" in adapter
    assert 'listEnabledAutomationDefinitionsByTrigger' in adapter
    assert 'normalizeInstagramMessageAutomationText' in adapter
    assert 'instagramMessageAutomationMatches' in adapter
    assert 'enqueueAutomationExecution' in adapter
    assert 'sourceEventKey' in adapter
    assert 'conversationId' in adapter


def test_instagram_webhook_enqueues_dm_automation_only_on_new_inbound_message():
    runtime = read('lib/meta/instagram-webhook-runtime.ts')

    assert 'prepareInstagramMessageCoreAutomation' in runtime
    assert 'enqueueInstagramMessageCoreAutomation' in runtime
    assert 'onCreated: async (tx, created)' in runtime
    assert 'meta-instagram:${instagramProfessionalAccountId}:${externalMessageId}' in runtime
    assert 'if (persisted.duplicate) result.duplicates += 1' in runtime
    assert 'messageAutomationsQueued' in runtime


def test_instagram_dm_handler_reuses_safe_outbox_and_requires_authorized_actor():
    handler = read('lib/automation/handlers/instagram-send-text.ts')
    worker = read('lib/automation/worker.ts')

    assert 'enqueueAndDispatchInstagramTextMessage' in handler
    assert "can(preferred.role, 'INTEGRATIONS_EDIT')" in handler
    assert "can(preferred.role, 'INBOX_MANAGE')" in handler
    assert 'context.idempotencyKey' in handler
    assert "error.code === 'RECIPIENT_NOT_ELIGIBLE'" in handler
    assert '[INSTAGRAM_SEND_TEXT_ACTION]: createInstagramSendTextAutomationHandler()' in worker

    lowered = handler.lower()
    for forbidden in (
        'prisma.lead.',
        'tx.lead.',
        'tenantmetaconnection',
        'pixel',
        'dataset',
        'campaign',
        'adset',
    ):
        assert forbidden not in lowered
