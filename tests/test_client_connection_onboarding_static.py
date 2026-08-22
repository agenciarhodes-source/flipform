from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_integrations_page_surfaces_guided_whatsapp_onboarding_before_technical_sections():
    page = read('app/(app)/integrations/page.tsx')

    assert 'ClientConnectionOnboarding' in page
    assert page.index('<ClientConnectionOnboarding />') < page.index('<IntegrationsClient />')
    assert 'id="whatsapp-connection"' in page
    assert 'id="instagram-connection"' not in page
    assert 'InstagramBusinessLoginCard' not in page


def test_onboarding_reuses_existing_whatsapp_connection_health_endpoint_only():
    onboarding = read('app/(app)/integrations/client-connection-onboarding.tsx')

    assert "fetch('/api/integrations/whatsapp/connection'" in onboarding
    assert "fetch('/api/integrations/instagram/connection'" not in onboarding
    assert "fetch('/api/integrations/instagram/connect'," not in onboarding
    assert "fetch('/api/integrations/whatsapp/embedded-signup/" not in onboarding


def test_onboarding_keeps_tenant_and_secrets_server_side():
    onboarding = read('app/(app)/integrations/client-connection-onboarding.tsx')

    assert 'tenantId' not in onboarding
    assert 'accessToken' not in onboarding
    assert 'appSecret' not in onboarding
    assert 'clientSecret' not in onboarding
    assert "method: 'DELETE'" not in onboarding


def test_onboarding_focuses_flipform_on_whatsapp_only():
    onboarding = read('app/(app)/integrations/client-connection-onboarding.tsx')

    assert "href: '#whatsapp-connection'" in onboarding
    assert 'WhatsApp Business' in onboarding
    assert 'Cloud API oficial' in onboarding
    assert 'Instagram' not in onboarding
    assert 'payload.error' not in onboarding


def test_onboarding_does_not_mutate_crm_or_kanban():
    paths = [
        'app/(app)/integrations/page.tsx',
        'app/(app)/integrations/client-connection-onboarding.tsx',
    ]
    combined = '\n'.join(read(path) for path in paths)

    assert '/api/leads' not in combined
    assert '/api/kanban' not in combined
    assert '/api/conversations' not in combined
    assert '/api/messages' not in combined
    assert 'prisma.' not in combined
