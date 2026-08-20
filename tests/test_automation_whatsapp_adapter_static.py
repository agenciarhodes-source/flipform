from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_whatsapp_adapter_uses_generic_core_with_deterministic_keyword_matching():
    adapter = read('lib/automation/adapters/whatsapp-message.ts')

    assert "WHATSAPP_MESSAGE_KEYWORD_TRIGGER = 'whatsapp.message.keyword'" in adapter
    assert "WHATSAPP_SEND_TEXT_ACTION = 'whatsapp.send_text'" in adapter
    assert 'listEnabledAutomationDefinitionsByTrigger' in adapter
    assert 'enqueueAutomationExecution' in adapter
    assert ".normalize('NFKC')" in adapter
    assert '.toLowerCase()' in adapter
    assert ".replace(/[^\\p{L}\\p{N}]+/gu, ' ')" in adapter
    assert "input.matchType === 'exact'" in adapter
    assert '` ${input.normalizedMessage} `.includes(` ${input.normalizedKeyword} `)' in adapter
    assert 'conversationId' in adapter
    assert 'sourceMessageId' in adapter


def test_whatsapp_send_handler_reuses_existing_safe_outbox_and_authority():
    handler = read('lib/automation/handlers/whatsapp-send-text.ts')

    assert 'enqueueAndDispatchWhatsAppTextMessage' in handler
    assert "can(preferred.role, 'INTEGRATIONS_EDIT')" in handler
    assert "can(preferred.role, 'LEADS_CONTACT_WHATSAPP')" in handler
    assert "can(membership.role, 'INTEGRATIONS_EDIT')" in handler
    assert "can(membership.role, 'LEADS_CONTACT_WHATSAPP')" in handler
    assert 'requestedByUserId: actor.userId' in handler
    assert 'idempotencyKey: context.idempotencyKey' in handler
    assert "result.status === 'delivery_unknown'" in handler
    assert "result.status === 'in_progress'" in handler
    assert 'fetch(' not in handler
    assert 'graph.facebook.com' not in handler


def test_central_worker_registers_whatsapp_handler_without_replacing_instagram():
    worker = read('lib/automation/worker.ts')
    index = read('lib/automation/index.ts')

    assert '[INSTAGRAM_PRIVATE_REPLY_ACTION]: createInstagramPrivateReplyAutomationHandler()' in worker
    assert '[WHATSAPP_SEND_TEXT_ACTION]: createWhatsAppSendTextAutomationHandler()' in worker
    assert 'prepareWhatsAppMessageCoreAutomation' in index
    assert 'enqueueWhatsAppMessageCoreAutomation' in index
    assert 'createWhatsAppSendTextAutomationHandler' in index


def test_whatsapp_inbound_cutover_is_implemented_in_runtime_not_route():
    webhook = read('app/api/webhooks/meta/whatsapp/route.ts')
    runtime = read('lib/meta/whatsapp-runtime.ts')

    assert 'processWhatsAppCloudWebhook(payload)' in webhook
    assert 'prepareWhatsAppMessageCoreAutomation' not in webhook
    assert 'enqueueWhatsAppMessageCoreAutomation' not in webhook
    assert 'prepareWhatsAppMessageCoreAutomation' in runtime
    assert 'enqueueWhatsAppMessageCoreAutomation' in runtime
    assert 'onCreated: async (tx, created) => {' in runtime


def test_whatsapp_core_adapter_does_not_touch_lead_or_kanban_and_exposes_no_secrets():
    paths = [
        'lib/automation/adapters/whatsapp-message.ts',
        'lib/automation/handlers/whatsapp-send-text.ts',
        'lib/automation/worker.ts',
        'lib/automation/index.ts',
    ]
    combined = '\n'.join(read(path) for path in paths)

    for forbidden in (
        '/api/leads',
        '/api/kanban',
        'prisma.lead.',
        'tx.lead.',
        'accessToken',
        'appSecret',
        'clientSecret',
        'systemUserAccessToken',
    ):
        assert forbidden not in combined
