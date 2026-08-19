from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def core_text() -> str:
    return '\n'.join([
        read('lib/automation/types.ts'),
        read('lib/automation/json.ts'),
        read('lib/automation/definition-store.ts'),
        read('lib/automation/execution-engine.ts'),
        read('lib/automation/index.ts'),
    ])


def test_generic_automation_core_is_provider_agnostic_and_additive():
    core = core_text()
    schema = read('prisma/schema.prisma')

    assert "AUTOMATION_DEFINITION_ENTITY_TYPE = 'automation_definition_v1'" in core
    assert "AUTOMATION_EXECUTION_PROVIDER = 'automation_execution_v1'" in core
    assert "AUTOMATION_EXECUTION_SOURCE = 'flipform_automation_core_v1'" in core
    assert 'graph.instagram.com' not in core
    assert 'graph.facebook.com' not in core
    assert 'whatsapp' not in core.lower()
    assert 'model AutomationDefinition' not in schema
    assert 'model AutomationExecution' not in schema


def test_definitions_are_versioned_append_only_and_serialized_per_tenant():
    core = core_text()

    assert "AUTOMATION_DEFINITION_CREATED_ACTION = 'AUTOMATION_DEFINITION_CREATED'" in core
    assert "AUTOMATION_DEFINITION_UPDATED_ACTION = 'AUTOMATION_DEFINITION_UPDATED'" in core
    assert 'tx.auditLog.create' in core
    assert 'versionNumber = 1' in core
    assert 'versionNumber = current.versionNumber + 1' in core
    assert 'FROM public.tenants WHERE id = ${input.tenantId} FOR UPDATE' in core
    assert 'listAutomationDefinitions' in core
    assert 'listEnabledAutomationDefinitionsByTrigger' in core


def test_definition_and_execution_payloads_are_bounded_json_only():
    core = core_text()

    assert 'MAX_TRIGGER_OR_ACTION_CONFIG_BYTES = 16 * 1024' in core
    assert 'MAX_EXECUTION_INPUT_BYTES = 32 * 1024' in core
    assert 'MAX_DEFINITION_BYTES = 64 * 1024' in core
    assert 'MAX_AUTOMATION_ACTIONS = 20' in core
    assert 'assertJsonValue' in core
    assert "key === '__proto__'" in core
    assert "key === 'constructor'" in core
    assert 'Number.isFinite(value)' in core
    assert 'Object.getPrototypeOf(value)' in core


def test_execution_enqueue_is_atomic_and_idempotent_without_new_table():
    core = core_text()

    assert 'export async function enqueueAutomationExecution' in core
    assert 'tx: Prisma.TransactionClient' in core
    assert 'INSERT INTO public.webhook_events' in core
    assert 'ON CONFLICT (provider, event_id) DO NOTHING' in core
    assert "createHash('sha256')" in core
    assert "'flipform-automation-execution-v1'" in core
    event_id_fn = core.split('export function automationExecutionEventId', 1)[1].split('export async function enqueueAutomationExecution', 1)[0]
    assert 'definitionVersionId' not in event_id_fn
    assert 'definitionVersionId: input.definition.versionId' in core
    assert 'assertAutomationDefinitionVersionInTenant(tx' in core
    assert 'tenantId: input.tenantId' in core
    assert "state: 'queued'" in core
    assert 'actionIndex: 0' in core


def test_worker_uses_lease_skip_locked_version_binding_and_cursor():
    core = core_text()

    assert 'FOR UPDATE SKIP LOCKED' in core
    assert 'AUTOMATION_PROCESSING_LEASE_MS = 2 * 60_000' in core
    assert 'AUTOMATION_MAX_INTERNAL_ATTEMPTS = 3' in core
    assert 'definition.versionId !== execution.metadata.definitionVersionId' in core
    assert "'definition_version_changed'" in core
    assert 'persistExecutionActionCursor' in core
    assert 'actionIndex += 1' in core
    assert 'processedAt: new Date()' in core
    assert 'leaseToken: randomUUID()' in core
    assert "raw_payload->>'leaseToken' = ${input.leaseToken}" in core
    assert "raw_payload->>'state' = 'processing'" in core
    claim_query = core.split('async function claimAutomationExecutions', 1)[1].split('async function persistExecutionActionCursor', 1)[0]
    assert claim_query.index('AND NOT COALESCE(') < claim_query.index('LIMIT ${safeBatchSize}')
    assert "raw_payload->>'attemptStartedAt' > ${staleBeforeIso}" in claim_query
    assert "if (!cursorPersisted) return 'deferred' as const" in core


def test_action_handlers_are_explicit_idempotent_and_fail_closed():
    core = core_text()

    assert 'export type AutomationActionHandler' in core
    assert 'handlers: AutomationActionHandlers' in core
    assert 'idempotencyKey: `automation:${execution.id}:action:${action.id}`' in core
    assert "result.status === 'delivery_unknown'" in core
    assert "state: 'delivery_unknown'" in core
    assert "result.status === 'retry'" in core
    assert "'action_handler_missing'" in core
    assert 'fetch(' not in core


def test_core_has_no_crm_or_customer_history_mutation():
    core = core_text().lower()

    for forbidden in (
        'prisma.lead.', 'tx.lead.',
        'prisma.conversation.', 'tx.conversation.',
        'prisma.message.', 'tx.message.',
        'prisma.pipeline.', 'tx.pipeline.',
        'delete from leads', 'update leads set',
        'truncate ', 'drop table',
    ):
        assert forbidden not in core
