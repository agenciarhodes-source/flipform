from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_instagram_platform_admin_has_dedicated_endpoint():
    route = read('app/api/admin/integrations/instagram/platform/route.ts')
    assert 'withPlatformAdmin' in route
    assert 'updatePlatformInstagramSettings' in route
    assert "'/api/webhooks/meta/instagram'" in route
    assert 'INSTAGRAM_OAUTH_CALLBACK_PATH' in route
    assert '.strict()' in route
    assert 'tenantId' not in route


def test_instagram_platform_write_is_channel_scoped():
    service = read('lib/meta/platform-settings.ts')
    instagram_update = service.split('export async function updatePlatformInstagramSettings', 1)[1].split('export async function updatePlatformMetaSettings', 1)[0]

    assert 'instagramAppId' in instagram_update
    assert 'instagramAppSecretEncrypted' in instagram_update
    assert 'encryptIntegrationSecret(input.instagramAppSecret)' in instagram_update
    assert 'looksMaskedSecret(input.instagramAppSecret)' in instagram_update

    for forbidden in (
        'tenantMetaConnection',
        'tenantInstagramConnection',
        'tenantIntegrationSettings',
        'metaPixelId',
        'businessLoginConfigId',
        'whatsappEmbeddedSignupConfigId',
        'whatsappBusinessId',
        'whatsappSystemUserId',
        'defaultPixelEnabled',
        'defaultCapiEnabled',
        'defaultQualifiedLeadEnabled',
        'defaultPurchaseEnabled',
        'lead.',
        'pipeline.',
        'campaign',
        'adset',
        'graph.facebook.com',
    ):
        assert forbidden not in instagram_update


def test_global_meta_save_cannot_overwrite_instagram_configuration():
    service = read('lib/meta/platform-settings.ts')
    global_update = service.split('export async function updatePlatformMetaSettings', 1)[1]
    route = read('app/api/admin/integrations/meta/route.ts')
    page = read('app/admin/(secure)/integrations/page.tsx')

    assert 'instagramAppId: _instagramAppId' in global_update
    assert 'instagramAppSecret: _instagramAppSecret' in global_update
    update_block = global_update.split('update: {', 1)[1].split('},\n  });', 1)[0]
    assert 'instagramAppId' not in update_block
    assert 'instagramAppSecretEncrypted' not in update_block

    assert 'instagramAppId: z.string().trim().max(128).optional()' in route
    assert 'instagramAppSecret: z.string().trim().min(1).max(512).optional()' in route
    save_body = page.split('const body: Record<string, unknown> = {', 1)[1].split('};', 1)[0]
    assert 'instagramAppId' not in save_body
    assert 'instagramAppSecret' not in page


def test_admin_ui_parks_instagram_configuration_without_mutating_backend_state():
    page = read('app/admin/(secure)/integrations/page.tsx')
    component = read('app/admin/(secure)/integrations/instagram-platform-config-card.tsx')

    assert 'InstagramPlatformConfigCard' not in page
    assert 'Instagram App ID' not in page
    assert 'Instagram App Secret' not in page
    assert 'Ads e WhatsApp da plataforma' in page

    # Dormant component remains isolated in source; no destructive rollback is required.
    assert "/api/admin/integrations/instagram/platform" in component
    assert 'Salvar somente Instagram' in component
    assert 'Nenhuma conexão de cliente foi alterada.' in component
    assert 'tenantId' not in component
    assert 'accessToken' not in component
    assert 'pixel' not in component.lower()
    assert 'campaign' not in component.lower()
