from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_instagram_runtime_preflight_is_read_only_and_fail_closed():
    readiness = read('lib/meta/instagram-runtime-readiness.ts')

    for table in (
        'tenant_instagram_connections',
        'external_contact_identities',
        'conversations',
        'messages',
        'webhook_events',
    ):
        assert table in readiness

    assert 'to_regclass' in readiness
    assert 'getInstagramWebhookVerifyToken' in readiness
    assert 'isPlatformInstagramLoginAvailable' in readiness
    assert 'ready: Boolean(platformConfigured && webhookVerifyTokenConfigured && schema.schemaReady)' in readiness

    upper = readiness.upper()
    for forbidden in ('INSERT ', 'UPDATE ', 'DELETE ', 'TRUNCATE ', 'DROP ', 'ALTER ', 'CREATE TABLE'):
        assert forbidden not in upper


def test_instagram_oauth_is_blocked_before_any_authorization_when_runtime_is_incomplete():
    connect = read('app/api/integrations/instagram/connect/route.ts')
    callback = read('app/api/integrations/instagram/callback/route.ts')

    assert 'isInstagramRuntimeReady' in connect
    assert 'if (!credentials || !runtimeReady)' in connect
    assert connect.index('if (!credentials || !runtimeReady)') < connect.index('createMetaOAuthStateForPurpose')
    assert 'isInstagramRuntimeReady' in callback
    assert callback.index('if (!credentials || !runtimeReady)') < callback.index('exchangeInstagramAuthorizationCode')


def test_tenant_connection_status_exposes_only_safe_boolean_readiness():
    route = read('app/api/integrations/instagram/connection/route.ts')

    assert 'getInstagramRuntimeReadiness' in route
    assert 'connectionAvailable: readiness.ready' in route
    assert 'missingTables' not in route
    assert 'webhookVerifyTokenConfigured' not in route
    assert 'accessToken' not in route
    assert 'appSecret' not in route


def test_instagram_is_optional_in_customer_ui_and_does_not_surface_admin_internals():
    card = read('app/(app)/integrations/instagram-business-login-card.tsx')
    onboarding = read('app/(app)/integrations/client-connection-onboarding.tsx')

    assert 'Integração opcional para Direct, comentários e automações.' in card
    assert 'O Instagram é opcional e está desconectado. Nenhuma ação é necessária agora.' in card
    assert 'connectionAvailable' in card
    assert 'App ID' not in card
    assert 'App Secret' not in card
    assert 'Super Admin' not in card

    assert 'Instagram e WhatsApp são opcionais.' in onboarding
    assert "optionalDisconnected('Instagram'" in onboarding
    assert "optionalDisconnected('WhatsApp'" in onboarding
    assert 'payload.error' not in onboarding
    assert 'Super Admin' not in onboarding


def test_optional_instagram_work_does_not_touch_ads_tracking_or_customer_data():
    paths = (
        'lib/meta/instagram-runtime-readiness.ts',
        'app/api/integrations/instagram/connect/route.ts',
        'app/api/integrations/instagram/callback/route.ts',
        'app/api/integrations/instagram/connection/route.ts',
        'app/(app)/integrations/instagram-business-login-card.tsx',
        'app/(app)/integrations/client-connection-onboarding.tsx',
        'app/api/admin/integrations/instagram/readiness/route.ts',
    )
    combined = '\n'.join(read(path) for path in paths)

    for forbidden in (
        'tenantMetaConnection.update',
        'tenantMetaConnection.updateMany',
        'metaPixelId:',
        'metaAdAccountId:',
        'trackingEventLog.',
        'kanbanStageTrackingEvent.',
        'prisma.lead.',
        'tx.lead.',
        'prisma.pipeline.',
        'tx.pipeline.',
        'prisma.form.',
        'tx.form.',
        'status=PAUSED',
        "method: 'PATCH'",
        "method: 'PUT'",
    ):
        assert forbidden not in combined
