from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_inbound_core_supports_atomic_on_created_callback_without_provider_coupling():
    core = read('lib/conversations/core.ts')

    assert 'export type RecordInboundMessageOptions' in core
    assert 'onCreated?: (' in core
    assert 'tx: Prisma.TransactionClient' in core
    assert 'context: RecordInboundMessageCreatedContext' in core
    assert 'options: RecordInboundMessageOptions = {}' in core

    transaction = core.split('return await prisma.$transaction(async (tx) => {', 1)[1].split('} catch (error)', 1)[0]
    assert 'const message = await tx.message.create' in transaction
    assert 'const updatedConversation = await advanceInboundActivity' in transaction
    assert 'await options.onCreated(tx, {' in transaction
    assert transaction.index('const message = await tx.message.create') < transaction.index('await options.onCreated(tx, {')
    assert transaction.index('const updatedConversation = await advanceInboundActivity') < transaction.index('await options.onCreated(tx, {')

    callback_block = core.split('if (options.onCreated)', 1)[1].split('return { identity:', 1)[0]
    assert 'identityId: updatedIdentity.id' in callback_block
    assert 'conversationId: updatedConversation.id' in callback_block
    assert 'messageId: message.id' in callback_block
    assert 'whatsapp' not in callback_block.lower()
    assert 'instagram' not in callback_block.lower()


def test_whatsapp_inbound_prepares_and_enqueues_core_execution_inside_message_transaction():
    runtime = read('lib/meta/whatsapp-runtime.ts')

    assert 'prepareWhatsAppMessageCoreAutomation' in runtime
    assert 'enqueueWhatsAppMessageCoreAutomation' in runtime
    assert 'const messageText = normalizeMessageText(message)' in runtime
    assert 'const preparedAutomation = messageText' in runtime
    assert 'recordInboundMessage({' in runtime
    assert 'onCreated: async (tx, created) => {' in runtime
    assert 'enqueueWhatsAppMessageCoreAutomation(tx, {' in runtime
    assert 'conversationId: created.conversationId' in runtime
    assert 'sourceMessageId: message.id' in runtime
    assert 'sourceEventKey: `meta-whatsapp:${phoneNumberId}:${message.id}`' in runtime
    assert 'automationsQueued: 0' in runtime
    assert 'if (automationQueued) result.automationsQueued += 1' in runtime

    message_loop = runtime.split('for (const message of Array.isArray(value?.messages)', 1)[1].split('for (const status of Array.isArray(value?.statuses)', 1)[0]
    assert message_loop.index('prepareWhatsAppMessageCoreAutomation') < message_loop.index('recordInboundMessage({')
    assert message_loop.index('recordInboundMessage({') < message_loop.index('enqueueWhatsAppMessageCoreAutomation(tx, {')


def test_duplicate_whatsapp_delivery_does_not_enqueue_again():
    core = read('lib/conversations/core.ts')
    runtime = read('lib/meta/whatsapp-runtime.ts')

    existing_branch = core.split('if (existing) {', 1)[1].split('const timestamp', 1)[0]
    assert 'duplicate: true as const' in existing_branch
    assert 'options.onCreated' not in existing_branch
    assert 'if (persisted.duplicate) result.duplicateMessages += 1' in runtime


def test_whatsapp_webhook_runs_core_worker_after_response_with_durable_fallback():
    route = read('app/api/webhooks/meta/whatsapp/route.ts')

    assert "import { runAutomationWorker } from '@/lib/automation'" in route
    assert "import { scheduleAfterResponse } from '@/lib/vercel-wait-until'" in route
    assert 'if (result.automationsQueued > 0)' in route
    assert 'const backgroundWork = runAutomationWorker()' in route
    assert 'if (!scheduleAfterResponse(backgroundWork))' in route
    assert 'await backgroundWork' in route
    assert 'Queue rows are durable and are also reclaimed by the central worker.' in route


def test_whatsapp_cutover_does_not_mutate_lead_kanban_pipeline_or_add_secrets():
    paths = [
        'lib/conversations/core.ts',
        'lib/meta/whatsapp-runtime.ts',
        'app/api/webhooks/meta/whatsapp/route.ts',
    ]
    combined = '\n'.join(read(path) for path in paths)

    for forbidden in (
        '/api/leads',
        '/api/kanban',
        'prisma.pipeline.',
        'tx.pipeline.',
        'DELETE FROM leads',
        'TRUNCATE ',
        'DROP TABLE',
    ):
        assert forbidden not in combined

    runtime = read('lib/meta/whatsapp-runtime.ts')
    assert 'systemUserAccessToken' not in runtime
    assert 'adminSystemUserAccessToken' not in runtime
    assert 'Authorization: `Bearer' not in runtime
