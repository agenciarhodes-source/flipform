from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_instagram_dm_config_maps_rules_to_multistep_automation_core():
    config = read('lib/automation/instagram-message-config.ts')

    assert 'createAutomationDefinition' in config
    assert 'updateAutomationDefinition' in config
    assert 'listAutomationDefinitions' in config
    assert 'INSTAGRAM_MESSAGE_KEYWORD_TRIGGER' in config
    assert 'INSTAGRAM_SEND_TEXT_ACTION' in config
    assert 'LEAD_ENSURE_FROM_CONVERSATION_ACTION' in config
    assert 'LEAD_MOVE_STAGE_ACTION' in config
    assert 'replyActionId: replyAction.id' in config
    assert 'current?.ensureLead?.actionId' in config
    assert 'current?.moveLead?.actionId' in config
    assert "source: 'instagram_direct'" in config
    assert 'assertNoConflict' in config
    assert 'actions: buildActions(fields)' in config
    assert 'actions: buildActions(fields, current)' in config


def test_instagram_dm_crm_targets_are_validated_without_direct_lead_mutation():
    config = read('lib/automation/instagram-message-config.ts')

    assert 'async function assertCrmTargets' in config
    assert 'prisma.pipelineStage.findFirst' in config
    assert 'pipeline: { tenantId: input.tenantId, isArchived: false }' in config
    assert 'ensureLead && moveLead && ensureLead.pipelineId !== moveLead.pipelineId' in config

    lowered = config.lower()
    for forbidden in (
        'prisma.lead.',
        'tx.lead.',
        'prisma.conversation.',
        'tx.conversation.',
        'tenantmetaconnection',
        'accesstoken',
        'appsecret',
        'graph.facebook.com',
        'campaign',
        'adset',
        'pixel',
        'dataset',
        'delete from leads',
        'truncate ',
        'drop table',
    ):
        assert forbidden not in lowered


def test_instagram_dm_automation_api_is_tenant_scoped_by_session():
    collection = read('app/api/integrations/instagram/message-automations/route.ts')
    item = read('app/api/integrations/instagram/message-automations/[id]/route.ts')

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
    assert ".strict()" in collection
    assert ".strict()" in item
