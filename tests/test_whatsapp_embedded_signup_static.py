from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_whatsapp_credentials_are_platform_scoped_and_ads_remains_separate():
    schema = read('prisma/schema.prisma')
    ads = schema.split('model TenantMetaConnection {', 1)[1].split('\n}', 1)[0]
    platform = schema.split('model PlatformMetaSettings {', 1)[1].split('\n}', 1)[0]
    whatsapp = schema.split('model TenantWhatsAppConnection {', 1)[1].split('\n}', 1)[0]
    assert 'wabaId' not in ads
    assert 'phoneNumberId' not in ads
    assert 'whatsappAdminSystemUserAccessTokenEncrypted' in platform
    assert 'whatsappSystemUserAccessTokenEncrypted' in platform
    assert 'accessTokenEncrypted' not in whatsapp
    assert 'tokenExpiresAt' not in whatsapp
    assert 'grantedScopes' not in whatsapp
    assert 'wabaId' in whatsapp
    assert 'phoneNumberId' in whatsapp
    assert 'systemUserAssignedAt' in whatsapp
    assert '@@map("tenant_whatsapp_connections")' in whatsapp
    assert '@unique @map("waba_id")' in whatsapp
    assert '@unique @map("phone_number_id")' in whatsapp


def test_whatsapp_migration_is_additive_only():
    migration = read('prisma/migrations/20260814210000_add_tenant_whatsapp_connections/migration.sql').upper()
    assert 'ADD COLUMN "WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID"' in migration
    assert 'ADD COLUMN "WHATSAPP_BUSINESS_ID"' in migration
    assert 'ADD COLUMN "WHATSAPP_SYSTEM_USER_ID"' in migration
    assert 'WHATSAPP_ADMIN_SYSTEM_USER_ACCESS_TOKEN_ENCRYPTED' in migration
    assert 'WHATSAPP_SYSTEM_USER_ACCESS_TOKEN_ENCRYPTED' in migration
    assert 'CREATE TABLE "TENANT_WHATSAPP_CONNECTIONS"' in migration
    assert 'CREATE UNIQUE INDEX "TENANT_WHATSAPP_CONNECTIONS_WABA_ID_KEY"' in migration
    assert 'CREATE UNIQUE INDEX "TENANT_WHATSAPP_CONNECTIONS_PHONE_NUMBER_ID_KEY"' in migration
    assert 'ACCESS_TOKEN_ENCRYPTED' not in migration.split('CREATE TABLE "TENANT_WHATSAPP_CONNECTIONS"', 1)[1]
    for destructive in ('DROP TABLE', 'DROP COLUMN', 'DELETE FROM', 'TRUNCATE', 'UPDATE "', 'INSERT INTO'):
        assert destructive not in migration


def test_platform_admin_has_dedicated_whatsapp_system_user_config():
    schema = read('prisma/schema.prisma')
    service = read('lib/meta/platform-settings.ts')
    route = read('app/api/admin/integrations/meta/route.ts')
    page = read('app/admin/(secure)/integrations/page.tsx')
    assert 'whatsappEmbeddedSignupConfigId' in schema
    assert 'whatsappBusinessId' in schema
    assert 'whatsappSystemUserId' in schema
    assert 'getPlatformWhatsAppEmbeddedSignupCredentials' in service
    assert 'getPlatformWhatsAppEmbeddedSignupClientConfig' in service
    assert 'isPlatformWhatsAppEmbeddedSignupAvailable' in service
    assert 'encryptIntegrationSecret(input.whatsappAdminSystemUserAccessToken)' in service
    assert 'encryptIntegrationSecret(input.whatsappSystemUserAccessToken)' in service
    dto = service.split('function toAdminDto', 1)[1].split('export async function', 1)[0]
    assert 'whatsappAdminSystemUserAccessTokenEncrypted:' not in dto
    assert 'whatsappSystemUserAccessTokenEncrypted:' not in dto
    assert 'whatsappEmbeddedSignupConfigId' in route
    assert 'whatsappAdminSystemUserAccessToken' in route
    assert 'whatsappSystemUserAccessToken' in route
    assert 'Admin System User Access Token' in page
    assert 'System User Access Token de runtime' in page


def test_signup_config_is_tenant_and_purpose_bound_without_secret_decryption():
    route = read('app/api/integrations/whatsapp/embedded-signup/config/route.ts')
    state = read('lib/meta/whatsapp-signup-state.ts')
    assert "withPermission('INTEGRATIONS_EDIT'" in route
    assert 'META_WHATSAPP_ONBOARDING_PURPOSE' in route
    assert 'createMetaOAuthStateForPurpose' in route
    assert 'session.tenantId' in route
    assert 'session.userId' in route
    assert 'WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE' in route
    assert "path: WHATSAPP_EMBEDDED_SIGNUP_STATE_COOKIE_PATH" in route
    assert "'/api/integrations/whatsapp'" in state
    assert 'getPlatformWhatsAppEmbeddedSignupClientConfig' in route
    assert 'getPlatformWhatsAppEmbeddedSignupCredentials' not in route
    response = route.split('const response = NextResponse.json({', 1)[1].split('});', 1)[0]
    assert 'appSecret' not in response
    assert 'AccessToken' not in response
    assert 'systemUserId' not in response
    assert 'businessId' not in response


def test_completion_uses_ephemeral_signup_token_then_platform_system_user():
    route = read('app/api/integrations/whatsapp/embedded-signup/complete/route.ts')
    helper = read('lib/meta/whatsapp.ts')
    assert 'verifyMetaOAuthStateForPurpose' in route
    assert 'META_WHATSAPP_ONBOARDING_PURPOSE' in route
    assert 'exchangeWhatsAppEmbeddedSignupCode' in route
    assert 'validateWhatsAppEmbeddedSignupToken' in route
    assert 'ensureSystemUserAssignedToWhatsAppWaba' in route
    assert 'validateWhatsAppSystemUserToken' in route
    assert route.count('validateWhatsAppWabaPhoneSelection') >= 3
    assert 'subscribeAppToWhatsAppWaba' in route
    assert "tenantId: { not: session.tenantId }" in route
    assert 'encryptIntegrationSecret(exchanged.accessToken)' not in route
    assert 'accessTokenEncrypted' not in route
    assert 'tokenExpiresAt' not in route
    assert 'prisma.$transaction' in route
    assert 'WHATSAPP_EMBEDDED_SIGNUP_CONNECTED' in route
    assert "credentialMode: 'platform_system_user'" in route
    assert 'debugAccessToken: credentials.systemUserAccessToken' in route

    embedded_scopes = helper.split('WHATSAPP_EMBEDDED_SIGNUP_REQUIRED_SCOPES = [', 1)[1].split('] as const', 1)[0]
    runtime_scopes = helper.split('WHATSAPP_SYSTEM_USER_REQUIRED_SCOPES = [', 1)[1].split('] as const', 1)[0]
    assert "'whatsapp_business_management'" in embedded_scopes
    assert "'whatsapp_business_messaging'" not in embedded_scopes
    assert "'whatsapp_business_management'" in runtime_scopes
    assert "'whatsapp_business_messaging'" in runtime_scopes
    assert 'requiredScopes: WHATSAPP_EMBEDDED_SIGNUP_REQUIRED_SCOPES' in helper
    assert 'requiredScopes: WHATSAPP_SYSTEM_USER_REQUIRED_SCOPES' in helper
    assert "new URLSearchParams({ input_token: input.accessToken })" in helper
    assert "metaJson(url, 'token_inspection', { accessToken: input.debugAccessToken })" in helper
    assert "access_token: `${input.appId}|${input.appSecret}`" not in helper
    assert 'managementTargets.includes(input.wabaId)' in helper
    assert '/assigned_users' in helper
    assert "tasks: JSON.stringify(['MANAGE'])" in helper
    assert 'business: input.businessId' in helper
    assert '/phone_numbers' in helper
    assert "fields: 'id,display_phone_number,verified_name,quality_rating'" in helper
    assert '/subscribed_apps' in helper
    assert "method: 'POST'" in helper


def test_connection_replacement_is_serialized_and_same_waba_row_is_reused():
    route = read('app/api/integrations/whatsapp/embedded-signup/complete/route.ts')
    assert 'tx.$queryRaw' in route
    assert 'FROM public.tenants' in route
    assert 'WHERE id = ${session.tenantId}' in route
    assert 'FOR UPDATE' in route
    assert 'const reusableBinding = await tx.tenantWhatsAppConnection.findFirst' in route
    assert 'where: { tenantId: session.tenantId, wabaId: runtimeSelection.waba.id }' in route
    assert "status: 'connected'" in route
    assert "...(reusableBinding ? { id: { not: reusableBinding.id } } : {})" in route
    assert 'reusableBinding\n        ? await tx.tenantWhatsAppConnection.update' in route
    assert ': await tx.tenantWhatsAppConnection.create' in route
    assert 'previousWabaId' in route
    assert 'previousPhoneNumberId' in route
    assert 'where: { phoneNumberId: runtimeSelection.phone.id }' not in route


def test_tenant_connection_status_never_returns_platform_credentials():
    route = read('app/api/integrations/whatsapp/connection/route.ts')
    assert "withPermission('INTEGRATIONS_VIEW'" in route
    assert "withPermission('INTEGRATIONS_EDIT'" in route
    assert 'accessToken' not in route
    assert 'appSecret' not in route
    assert 'systemUserAccessToken' not in route
    assert "status: 'revoked'" in route
    assert 'WHATSAPP_CONNECTION_REVOKED' in route
    assert '.delete(' not in route.lower()


def test_tenant_ui_uses_official_sdk_and_validates_embedded_signup_origin():
    ui = read('app/(app)/integrations/whatsapp-embedded-signup-card.tsx')
    assert 'https://connect.facebook.net/pt_BR/sdk.js' in ui
    assert "event.origin !== 'https://www.facebook.com'" in ui
    assert "event.origin !== 'https://web.facebook.com'" in ui
    assert "payload.type !== 'WA_EMBEDDED_SIGNUP'" in ui
    assert "payload.event === 'FINISH'" in ui
    assert "response_type: 'code'" in ui
    assert 'override_default_response_type: true' in ui
    assert "sessionInfoVersion: '3'" in ui
    assert '/api/integrations/whatsapp/embedded-signup/complete' in ui
