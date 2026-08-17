from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_instagram_registry_and_current_scopes_are_isolated_from_ads_and_whatsapp():
    registry = read('lib/meta/onboarding.ts')
    assert "flow: 'instagram_business_login'" in registry
    assert "'instagram_business_basic'" in registry
    assert "'instagram_business_manage_messages'" in registry
    assert "'instagram_business_manage_comments'" in registry
    assert "persistence: 'tenant_instagram_connections'" in registry
    instagram = read('lib/meta/instagram.ts')
    assert "INSTAGRAM_GRAPH_BASE_URL = 'https://graph.instagram.com'" in instagram
    assert "INSTAGRAM_AUTHORIZATION_URL = 'https://www.instagram.com/oauth/authorize'" in instagram
    assert "INSTAGRAM_TOKEN_URL = 'https://api.instagram.com/oauth/access_token'" in instagram
    assert 'tenantMetaConnection' not in instagram
    assert 'whatsapp' not in instagram.lower()


def test_instagram_migration_and_prisma_schema_are_additive_and_aligned():
    migration = read('prisma/migrations/20260816222000_add_tenant_instagram_connections/migration.sql')
    schema = read('prisma/schema.prisma')
    upper = migration.upper()
    assert 'ADD COLUMN "INSTAGRAM_APP_ID"' in upper
    assert 'ADD COLUMN "INSTAGRAM_APP_SECRET_ENCRYPTED"' in upper
    assert 'CREATE TABLE "TENANT_INSTAGRAM_CONNECTIONS"' in upper
    assert '"INSTAGRAM_USER_ID" TEXT NOT NULL' in upper
    assert '"ACCESS_TOKEN_ENCRYPTED" TEXT NOT NULL' in upper
    assert 'TENANT_INSTAGRAM_CONNECTIONS_INSTAGRAM_USER_ID_KEY' in upper
    assert 'REFERENCES "TENANTS"("ID")' in upper
    assert 'REFERENCES "USERS"("ID")' in upper
    for destructive in ('DROP TABLE', 'DROP COLUMN', 'DELETE FROM', 'TRUNCATE', 'UPDATE "', 'INSERT INTO'):
        assert destructive not in upper

    platform = schema.split('model PlatformMetaSettings {', 1)[1].split('\n}', 1)[0]
    connection = schema.split('model TenantInstagramConnection {', 1)[1].split('\n}', 1)[0]
    tenant = schema.split('model Tenant {', 1)[1].split('\n}', 1)[0]
    user = schema.split('model User {', 1)[1].split('\n}', 1)[0]
    assert 'instagramAppId' in platform
    assert 'instagramAppSecretEncrypted' in platform
    assert '@@map("tenant_instagram_connections")' in connection
    assert 'instagramUserId' in connection and '@unique' in connection
    assert 'accessTokenEncrypted' in connection
    assert 'instagramConnections' in tenant
    assert 'instagramConnectionsConnected' in user


def test_instagram_uses_dedicated_platform_app_credentials():
    platform = read('lib/meta/instagram-platform.ts')
    settings = read('lib/meta/platform-settings.ts')
    route = read('app/api/admin/integrations/meta/route.ts')
    page = read('app/admin/(secure)/integrations/page.tsx')
    assert 'instagramAppId: true' in platform
    assert 'instagramAppSecretEncrypted: true' in platform
    assert 'decryptIntegrationSecret(settings?.instagramAppSecretEncrypted)' in platform
    assert 'getPlatformMetaOAuthCredentials' not in platform
    assert 'instagramAppId: string' in settings
    assert 'instagramAppSecret?: string' in settings
    assert 'encryptIntegrationSecret(input.instagramAppSecret)' in settings
    assert 'instagramAppSecretMasked: maskSecretFromEncrypted(instagramAppSecretEncrypted)' in settings
    assert 'instagramLoginConfigured' in settings
    assert 'instagramAppId' in route
    assert 'instagramAppSecret' in route
    assert 'Instagram App ID' in page
    assert 'Instagram App Secret' in page


def test_connect_route_uses_signed_tenant_and_purpose_bound_state():
    route = read('app/api/integrations/instagram/connect/route.ts')
    assert "withPermission('INTEGRATIONS_EDIT'" in route
    assert 'createMetaOAuthStateForPurpose' in route
    assert 'session.tenantId' in route
    assert 'session.userId' in route
    assert 'META_INSTAGRAM_ONBOARDING_PURPOSE' in route
    assert 'INSTAGRAM_OAUTH_STATE_COOKIE' in route
    assert 'authorizationUrl' in route
    assert 'accessToken' not in route
    assert 'appSecret' not in route


def test_callback_keeps_instagram_token_out_of_ads_connection_and_encrypts_before_persistence():
    callback = read('app/api/integrations/instagram/callback/route.ts')
    assert 'verifyMetaOAuthStateForPurpose' in callback
    assert 'META_INSTAGRAM_ONBOARDING_PURPOSE' in callback
    assert 'exchangeInstagramAuthorizationCode' in callback
    assert 'exchangeInstagramLongLivedToken' in callback
    assert 'validateInstagramProfessionalAccount' in callback
    assert 'encryptIntegrationSecret(longLived.accessToken)' in callback
    assert 'persistInstagramConnection' in callback
    assert 'tenantMetaConnection' not in callback
    assert 'tenantWhatsAppConnection' not in callback
    assert 'console.info' in callback
    assert 'code,' not in callback.split("console.info('Instagram Business Login connected'", 1)[1]


def test_instagram_professional_account_validation_checks_basic_and_messaging_access():
    helper = read('lib/meta/instagram.ts')
    assert "profileUrl.searchParams.set('fields', 'id,username')" in helper
    assert '/conversations' in helper
    assert "conversationsUrl.searchParams.set('platform', 'instagram')" in helper
    assert "conversationsUrl.searchParams.set('limit', '1')" in helper
    assert "Authorization: `Bearer ${input.accessToken}`" in helper
    assert 'messaging_permission_validation' in helper


def test_connection_persistence_serializes_tenant_and_blocks_cross_tenant_asset_reuse():
    service = read('lib/meta/instagram-connection.ts')
    assert 'FROM public.tenants' in service
    assert 'FOR UPDATE' in service
    assert 'tenantInstagramConnection.findFirst' in service
    assert 'instagramUserId: input.instagramUserId' in service
    assert 'tenantId: { not: input.tenantId }' in service
    assert 'INSTAGRAM_ACCOUNT_BOUND_TO_OTHER_TENANT' in service
    assert "status: 'revoked'" in service
    assert "action: 'INSTAGRAM_CONNECTION_CONNECTED'" in service
    assert "action: 'INSTAGRAM_CONNECTION_REVOKED'" in service
    assert 'accessTokenEncrypted: input.accessTokenEncrypted' in service
    assert 'prisma.lead.' not in service
    assert 'prisma.conversation.' not in service
    assert 'prisma.message.' not in service


def test_expired_token_is_not_reported_as_connected():
    service = read('lib/meta/instagram-connection.ts')
    ui = read('app/(app)/integrations/instagram-business-login-card.tsx')
    assert 'connection.tokenExpiresAt.getTime() <= Date.now()' in service
    assert "status: 'expired'" in service
    assert "connection?.status === 'expired'" in ui
    assert 'Token expirado' in ui
    assert 'Reconecte o Instagram' in ui


def test_connection_status_and_ui_never_return_or_store_credentials_in_browser():
    route = read('app/api/integrations/instagram/connection/route.ts')
    ui = read('app/(app)/integrations/instagram-business-login-card.tsx')
    assert "withPermission('INTEGRATIONS_VIEW'" in route
    assert "withPermission('INTEGRATIONS_EDIT'" in route
    assert 'accessToken' not in route
    assert 'appSecret' not in route
    assert '/api/integrations/instagram/connect' in ui
    assert '/api/integrations/instagram/connection' in ui
    assert 'localStorage' not in ui
    assert 'sessionStorage' not in ui
    assert 'token da conta profissional é armazenado criptografado no servidor' in ui
    assert 'não exige que uma Página do Facebook esteja vinculada' in ui
