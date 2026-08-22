from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_integrations_page_surfaces_guided_onboarding_before_technical_sections():
    page = read('app/(app)/integrations/page.tsx')

    assert 'ClientConnectionOnboarding' in page
    assert page.index('<ClientConnectionOnboarding />') < page.index('<IntegrationsClient />')
    assert 'id="whatsapp-connection"' in page
    assert 'id="instagram-connection"' in page


def test_onboarding_reuses_existing_connection_health_endpoints():
    onboarding = read('app/(app)/integrations/client-connection-onboarding.tsx')

    assert "fetch('/api/integrations/instagram/connection'" in onboarding
    assert "fetch('/api/integrations/whatsapp/connection'" in onboarding
    assert 'Promise.allSettled' in onboarding
    assert "fetch('/api/integrations/instagram/connect'," not in onboarding
    assert "fetch('/api/integrations/whatsapp/embedded-signup/" not in onboarding


def test_onboarding_keeps_tenant_and_secrets_server_side():
    onboarding = read('app/(app)/integrations/client-connection-onboarding.tsx')

    assert 'tenantId' not in onboarding
    assert 'accessToken' not in onboarding
    assert 'appSecret' not in onboarding
    assert 'clientSecret' not in onboarding
    assert "method: 'DELETE'" not in onboarding


def test_onboarding_treats_instagram_and_whatsapp_as_optional_modules():
    onboarding = read('app/(app)/integrations/client-connection-onboarding.tsx')

    assert "href: '#instagram-connection'" in onboarding
    assert "href: '#whatsapp-connection'" in onboarding
    assert 'href="/automations"' in onboarding
    assert 'Instagram e WhatsApp são opcionais.' in onboarding
    assert "optionalDisconnected('Instagram'" in onboarding
    assert "optionalDisconnected('WhatsApp'" in onboarding
    assert 'Criar automação' in onboarding
    assert 'Conectar Instagram primeiro' not in onboarding
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
