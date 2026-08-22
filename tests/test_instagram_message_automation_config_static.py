from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_instagram_dm_config_maps_rules_to_automation_core_only():
    config = read('lib/automation/instagram-message-config.ts')

    assert 'createAutomationDefinition' in config
    assert 'updateAutomationDefinition' in config
    assert 'listAutomationDefinitions' in config
    assert 'INSTAGRAM_MESSAGE_KEYWORD_TRIGGER' in config
    assert 'INSTAGRAM_SEND_TEXT_ACTION' in config
    assert 'replyActionId: replyAction.id' in config
    assert 'assertNoConflict' in config

    lowered = config.lower()
    for forbidden in (
        'prisma.lead.',
        'tx.lead.',
        'prisma.pipeline',
        'tx.pipeline',
        'tenantmetaconnection',
        'accesstoken',
        'appsecret',
        'graph.facebook.com',
        'campaign',
        'adset',
        'pixel',
        'dataset',
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
    assert 'rateLimit({' in collection
    assert 'rateLimit({' in item
    assert ".strict()" in collection
    assert ".strict()" in item
