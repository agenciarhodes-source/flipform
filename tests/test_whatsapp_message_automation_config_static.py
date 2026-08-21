from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_whatsapp_message_config_maps_ui_rules_to_multistep_core_definitions():
    config = read('lib/automation/whatsapp-message-config.ts')

    assert 'createAutomationDefinition' in config
    assert 'updateAutomationDefinition' in config
    assert 'listAutomationDefinitions' in config
    assert 'WHATSAPP_MESSAGE_KEYWORD_TRIGGER' in config
    assert 'WHATSAPP_SEND_TEXT_ACTION' in config
    assert 'LEAD_ENSURE_FROM_CONVERSATION_ACTION' in config
    assert 'LEAD_MOVE_STAGE_ACTION' in config
    assert 'normalizeWhatsAppAutomationText' in config
    assert 'actions: buildActions(fields)' in config
    assert 'actions: buildActions(fields, current)' in config
    assert 'replyActionId: replyAction.id' in config
    assert 'current?.ensureLead?.actionId' in config
    assert 'current?.moveLead?.actionId' in config
    assert "source: 'whatsapp'" in config


def test_whatsapp_message_automation_api_is_tenant_scoped_via_session_permissions():
    collection = read('app/api/integrations/whatsapp/message-automations/route.ts')
    item = read('app/api/integrations/whatsapp/message-automations/[id]/route.ts')

    assert "withPermission('INTEGRATIONS_VIEW'" in collection
    assert "withPermission('INTEGRATIONS_EDIT'" in collection
    assert "'INTEGRATIONS_EDIT'" in item
    assert 'tenantId: session.tenantId' in collection
    assert 'tenantId: session.tenantId' in item
    assert 'userId: session.userId' in collection
    assert 'userId: session.userId' in item
    assert 'ensureLead: ensureLeadSchema.nullable()' in collection
    assert 'moveLead: moveLeadSchema.nullable()' in collection
    assert 'ensureLead: ensureLeadSchema.nullable()' in item
    assert 'moveLead: moveLeadSchema.nullable()' in item
    assert 'rateLimit({' in collection
    assert 'rateLimit({' in item


def test_whatsapp_crm_targets_are_validated_without_direct_lead_mutation():
    config = read('lib/automation/whatsapp-message-config.ts')

    assert 'async function assertCrmTargets' in config
    assert 'prisma.pipelineStage.findFirst' in config
    assert 'pipeline: { tenantId: input.tenantId, isArchived: false }' in config
    assert 'ensureLead.pipelineId !== moveLead.pipelineId' in config

    lowered = config.lower()
    for forbidden in (
        'prisma.lead.',
        'tx.lead.',
        'prisma.conversation.',
        'tx.conversation.',
        'accesstoken',
        'appsecret',
        'graph.facebook.com',
        'fetch(',
        'delete from leads',
        'truncate ',
        'drop table',
    ):
        assert forbidden not in lowered
