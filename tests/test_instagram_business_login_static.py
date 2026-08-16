from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_instagram_registry_and_current_scopes_are_isolated_from_ads_and_whatsapp():
    registry = read('lib/meta/onboarding.ts')
    assert "flow: 'instagram_business_login'" in registry
    assert "requiredScopes: ['instagram_business_basic', 'instagram_business_manage_messages']" in registry
    assert "persistence: 'tenant_instagram_connections'" in registry
    instagram = read('lib/meta/instagram.ts')
    assert "INSTAGRAM_GRAPH_BASE_URL = 'https://graph.instagram.com'" in instagram
    assert "INSTAGRAM_AUTHORIZATION_URL = 'https://www.instagram.com/oauth/authorize'" in instagram
    assert "INSTAGRAM_TOKEN_URL = 'https://api.instagram.com/oauth/access_token'" in instagram
    assert 'tenantMetaConnection' not in instagram
    assert 'whatsapp' not in instagram.lower()


def test_instagram_migration_is_additive_and_keeps_tokens_channel_scoped():
    migration = read('prisma/migrations/20260816222000_add_tenant_instagram_connections/migration.sql')
    upper = migration.upper()
    assert 'CREATE TABLE "TENANT_INSTAGRAM_CONNECTIONS"' in upper
    assert '"INSTAGRAM_USER_ID" TEXT NOT NULL' in upper
    assert '"ACCESS_TOKEN_ENCRYPTED" TEXT NOT NULL' in upper
    assert 'TENANT_INSTAGRAM_CONNECTIONS_INSTAGRAM_USER_ID_KEY' in upper
    assert 'REFERENCES "TENANTS"("ID")' in upper
    assert 'REFERENCES "USERS"("ID")' in upper
    for destructive in ('DROP TABLE', 'DROP COLUMN', 'DELETE FROM', 'TRUNCATE', 'UPDATE "', 'INSERT INTO'):
        assert destructive not in upper


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
    assert 'instagram_user_id = ${input.instagramUserId}' in service
    assert 'tenant_id <> ${input.tenantId}' in service
    assert 'INSTAGRAM_ACCOUNT_BOUND_TO_OTHER_TENANT' in service
    assert "status = 'revoked'" in service
    assert "action: 'INSTAGRAM_CONNECTION_CONNECTED'" in service
    assert "action: 'INSTAGRAM_CONNECTION_REVOKED'" in service
    assert 'access_token_encrypted' in service
    assert 'accessTokenEncrypted' in service
    assert '$queryRawUnsafe' not in service
    assert '$executeRawUnsafe' not in service
    assert 'prisma.lead.' not in service
    assert 'prisma.conversation.' not in service
    assert 'prisma.message.' not in service


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
