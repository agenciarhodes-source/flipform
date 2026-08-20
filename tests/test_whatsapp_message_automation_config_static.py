from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_whatsapp_message_config_maps_ui_rules_to_generic_core_definitions():
    config = read('lib/automation/whatsapp-message-config.ts')

    assert 'createAutomationDefinition' in config
    assert 'updateAutomationDefinition' in config
    assert 'listAutomationDefinitions' in config
    assert 'WHATSAPP_MESSAGE_KEYWORD_TRIGGER' in config
    assert 'WHATSAPP_SEND_TEXT_ACTION' in config
    assert 'normalizeWhatsAppAutomationText' in config
    assert 'keyword: fields.keyword' in config
    assert 'matchType: input.matchType' in config
    assert 'config: { text: fields.replyText }' in config
    assert 'id: current.actionId' in config


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
    assert 'rateLimit({' in collection
    assert 'rateLimit({' in item


def test_whatsapp_message_config_does_not_touch_crm_tokens_or_provider_http():
    paths = [
        'lib/automation/whatsapp-message-config.ts',
        'app/api/integrations/whatsapp/message-automations/route.ts',
        'app/api/integrations/whatsapp/message-automations/[id]/route.ts',
    ]
    combined = '\n'.join(read(path) for path in paths).lower()

    for forbidden in (
        'prisma.lead.',
        'tx.lead.',
        'prisma.pipeline.',
        'tx.pipeline.',
        'accesstoken',
        'appsecret',
        'graph.facebook.com',
        'fetch(',
        'delete from leads',
        'truncate ',
        'drop table',
    ):
        assert forbidden not in combined
