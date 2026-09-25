from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_whatsapp_funnel_is_hidden_from_customer_navigation_and_integrations():
    shell = read('components/app-shell.tsx')
    integrations = read('app/(app)/integrations/integrations-client.tsx')
    assert 'href: "/whatsapp-funnel"' not in shell
    assert 'label: "Funil WhatsApp"' not in shell
    assert 'Acessar Funil WhatsApp' not in integrations
    assert 'Quer configurar gatilhos por mensagens do vendedor?' not in integrations


def test_direct_whatsapp_funnel_page_redirects_without_rendering_legacy_client():
    page = read('app/(app)/whatsapp-funnel/page.tsx')
    assert "redirect('/integrations')" in page
    assert 'WhatsAppFunnelClient' not in page


def test_whatsapp_funnel_runtime_is_hard_disabled_before_trigger_processing():
    runtime = read('lib/tracking/whatsapp-funnel.ts')
    function = runtime.split('export async function processWhatsAppFunnelMessage', 1)[1]
    guard = function.index('if (WHATSAPP_FUNNEL_DEPRECATED)')
    settings_lookup = function.index('tenantIntegrationSettings.findUnique')
    trigger_lookup = function.index('whatsAppEventTrigger.findMany')
    assert 'WHATSAPP_FUNNEL_DEPRECATED = true as const' in runtime
    assert "reason: 'whatsapp_funnel_deprecated'" in function
    assert guard < settings_lookup
    assert guard < trigger_lookup


def test_deprecated_whatsapp_funnel_apis_are_read_only_and_return_gone():
    paths = [
        'app/api/integrations/whatsapp-funnel/route.ts',
        'app/api/integrations/whatsapp-funnel/[id]/route.ts',
        'app/api/integrations/whatsapp-funnel/activation/route.ts',
        'app/api/integrations/whatsapp-funnel/test/route.ts',
    ]
    combined = '\n'.join(read(path) for path in paths)
    assert "WHATSAPP_FUNNEL_DEPRECATED" in combined
    assert "{ status: 410 }" in combined
    assert "withPermission('INTEGRATIONS_" in combined
    for mutation in (
        'whatsAppEventTrigger.create',
        'whatsAppEventTrigger.update',
        'whatsAppEventTrigger.delete',
        'tenantIntegrationSettings.upsert',
        'sendMetaCapiEvent',
    ):
        assert mutation not in combined


def test_pr301_does_not_touch_customer_data_or_meta_connection_code():
    compared_files = [
        'components/app-shell.tsx',
        'app/(app)/integrations/integrations-client.tsx',
        'app/(app)/whatsapp-funnel/page.tsx',
        'app/api/integrations/whatsapp-funnel/route.ts',
        'app/api/integrations/whatsapp-funnel/[id]/route.ts',
        'app/api/integrations/whatsapp-funnel/activation/route.ts',
        'app/api/integrations/whatsapp-funnel/test/route.ts',
        'lib/tracking/whatsapp-funnel.ts',
    ]
    assert all('prisma/migrations/' not in path for path in compared_files)
    api_text = '\n'.join(read(path) for path in compared_files[3:7])
    for forbidden in ('lead.delete', 'conversation.delete', 'message.delete', 'metaConnection', 'tenantWhatsAppConnection'):
        assert forbidden not in api_text
