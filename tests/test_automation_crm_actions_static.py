from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_crm_action_constants_are_registered_in_central_worker():
    adapter = read('lib/automation/adapters/crm.ts')
    worker = read('lib/automation/worker.ts')
    index = read('lib/automation/index.ts')

    assert "LEAD_ENSURE_FROM_CONVERSATION_ACTION = 'lead.ensure_from_conversation'" in adapter
    assert "LEAD_MOVE_STAGE_ACTION = 'lead.move_stage'" in adapter
    assert '[LEAD_ENSURE_FROM_CONVERSATION_ACTION]: createLeadEnsureFromConversationAutomationHandler()' in worker
    assert '[LEAD_MOVE_STAGE_ACTION]: createLeadMoveStageAutomationHandler()' in worker
    assert 'LEAD_ENSURE_FROM_CONVERSATION_ACTION' in index
    assert 'LEAD_MOVE_STAGE_ACTION' in index


def test_lead_ensure_action_is_tenant_scoped_idempotent_and_links_conversation_identity():
    handler = read('lib/automation/handlers/lead-ensure-from-conversation.ts')

    assert "can(preferred.role, 'INTEGRATIONS_EDIT')" in handler
    assert "can(preferred.role, 'LEADS_CREATE')" in handler
    assert 'WHERE id = ${conversationId}' in handler
    assert 'AND tenant_id = ${context.tenantId}' in handler
    assert 'FOR UPDATE' in handler
    assert 'SELECT id FROM public.tenants WHERE id = ${context.tenantId} FOR UPDATE' in handler
    assert 'tenantId: context.tenantId, OR: contactOr' in handler
    assert 'take: 2' in handler
    assert "kind: 'ambiguous_contact'" in handler
    assert 'tx.lead.create({' in handler
    assert 'tx.leadStageHistory.create({' in handler
    assert 'tx.conversation.update({ where: { id: conversation.id }, data: { leadId } })' in handler
    assert 'tx.externalContactIdentity.update({ where: { id: identity.id }, data: { leadId } })' in handler
    assert "action: created ? 'lead.automation_created' : 'lead.automation_linked'" in handler


def test_lead_move_action_preserves_pipeline_scope_history_and_tracking_retry():
    handler = read('lib/automation/handlers/lead-move-stage.ts')

    assert "can(preferred.role, 'INTEGRATIONS_EDIT')" in handler
    assert "can(preferred.role, 'KANBAN_MOVE_ALL')" in handler
    assert 'WHERE id = ${conversationId}' in handler
    assert 'AND tenant_id = ${context.tenantId}' in handler
    assert 'FROM public.leads' in handler
    assert 'lead.pipeline_id !== pipelineId' in handler
    assert 'pipeline: { tenantId: context.tenantId, isArchived: false }' in handler
    assert 'tx.leadStageHistory.create({' in handler
    assert "entityType: 'automation_execution_action'" in handler
    assert "entityId: context.idempotencyKey" in handler
    assert "action: 'LEAD_STAGE_MOVED'" in handler
    assert 'dispatchKanbanStageTracking({' in handler
    assert "if (tracking.some(result => result.status === 'failed'))" in handler
    assert "return { status: 'retry', code: 'KANBAN_TRACKING_RETRY' }" in handler


def test_crm_actions_are_emitted_by_server_config_builder_not_client_runtime():
    config = read('lib/automation/whatsapp-message-config.ts')
    workspace = read('app/(app)/automations/whatsapp-message-automation-client.tsx')

    assert 'LEAD_ENSURE_FROM_CONVERSATION_ACTION' in config
    assert 'LEAD_MOVE_STAGE_ACTION' in config
    assert 'type: LEAD_ENSURE_FROM_CONVERSATION_ACTION' in config
    assert 'type: LEAD_MOVE_STAGE_ACTION' in config
    assert "source: 'whatsapp'" in config
    assert 'lead.ensure_from_conversation' not in workspace
    assert 'lead.move_stage' not in workspace
    assert '/api/leads' not in workspace
    assert '/api/kanban' not in workspace


def test_crm_handlers_do_not_call_http_or_expose_provider_credentials():
    combined = '\n'.join([
        read('lib/automation/handlers/lead-ensure-from-conversation.ts'),
        read('lib/automation/handlers/lead-move-stage.ts'),
    ])

    for forbidden in (
        'fetch(',
        'graph.facebook.com',
        'accessToken',
        'appSecret',
        'systemUserAccessToken',
        '/api/leads',
        '/api/kanban',
        'TRUNCATE ',
        'DROP TABLE',
    ):
        assert forbidden not in combined
