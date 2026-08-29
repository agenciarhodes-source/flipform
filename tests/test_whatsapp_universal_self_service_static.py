from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_tenant_onboarding_uses_one_universal_platform_box():
    config = read('app/api/integrations/whatsapp/embedded-signup/config/route.ts')
    complete = read('app/api/integrations/whatsapp/embedded-signup/complete/route.ts')
    client = read('app/(app)/integrations/whatsapp-embedded-signup-card.tsx')

    assert 'getPlatformWhatsAppEmbeddedSignupClientConfig' in config
    assert 'session.tenantId' in config
    assert 'session.userId' in config
    assert '/api/admin/' not in client
    assert '/api/integrations/whatsapp/embedded-signup/config' in client
    assert 'window.FB.login' in client
    assert 'config_id: config.configId' in client

    assert 'getPlatformWhatsAppEmbeddedSignupCredentials' in complete
    assert 'ensureSystemUserAssignedToWhatsAppWaba' in complete
    assert 'subscribeAppToWhatsAppWaba' in complete
    assert "tenantId: { not: session.tenantId }" in complete
    assert 'FOR UPDATE' in complete


def test_universal_preflight_is_admin_only_read_only_and_secret_safe():
    route = read('app/api/admin/integrations/meta/whatsapp/preflight/route.ts')
    preflight = read('lib/meta/whatsapp-platform-preflight.ts')
    helper = read('lib/meta/whatsapp.ts')
    combined = '\n'.join((route, preflight))

    assert 'withPlatformAdmin' in route
    assert "method: 'POST'" not in preflight
    assert 'validateWhatsAppPlatformAdminToken' in preflight
    assert 'validateWhatsAppPlatformRuntimeToken' in preflight
    assert 'verifyWhatsAppPlatformSystemUser' in preflight
    assert '/system_users' in helper
    assert "fields: 'id,name,role'" in helper

    for forbidden in (
        'prisma.',
        'tenantWhatsAppConnection',
        'tenantMetaConnection',
        'prisma.lead',
        'prisma.conversation',
        'INSERT ',
        'UPDATE ',
        'DELETE ',
        'DROP ',
        'TRUNCATE ',
    ):
        assert forbidden not in combined

    # Secrets are consumed before the DTO is assembled and never returned to the browser.
    returned_section = preflight.split('const checks = [', 1)[1]
    assert 'accessToken:' not in returned_section
    assert 'appSecret:' not in returned_section


def test_instagram_diagnostics_do_not_block_ads_whatsapp_rollout():
    rollout = read('lib/meta/platform-rollout-readiness.ts')
    route = read('app/api/admin/integrations/meta/readiness/route.ts')

    assert "new Set(['base', 'ads', 'whatsapp', 'whatsapp_webhook'])" in rollout
    assert "new Set(['instagram', 'instagram_webhook'])" in rollout
    assert '(opcional)' in rollout
    assert 'buildMetaRolloutReadiness' in route


def test_whatsapp_schema_repair_does_not_deploy_legacy_migrations():
    workflow = read('.github/workflows/repair-whatsapp-cloud-schema.yml')

    assert 'Repair WhatsApp Cloud schema' in workflow
    assert 'continue-on-error: true' in workflow
    assert 'npx prisma migrate status' in workflow
    assert 'Confirm WhatsApp schema repair' in workflow
    assert 'prisma migrate deploy' not in workflow
