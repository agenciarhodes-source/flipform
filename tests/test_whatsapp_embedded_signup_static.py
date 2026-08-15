from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_whatsapp_credentials_are_persisted_separately_from_ads():
    schema = read('prisma/schema.prisma')
    ads = schema.split('model TenantMetaConnection {', 1)[1].split('\n}', 1)[0]
    whatsapp = schema.split('model TenantWhatsAppConnection {', 1)[1].split('\n}', 1)[0]
    assert 'wabaId' not in ads
    assert 'phoneNumberId' not in ads
    assert 'accessTokenEncrypted' in whatsapp
    assert 'wabaId' in whatsapp
    assert 'phoneNumberId' in whatsapp
    assert '@@map("tenant_whatsapp_connections")' in whatsapp
    assert 'wabaId                 String   @unique' in whatsapp
    assert 'phoneNumberId          String   @unique' in whatsapp


def test_whatsapp_migration_is_additive_only():
    migration = read('prisma/migrations/20260814210000_add_tenant_whatsapp_connections/migration.sql').upper()
    assert 'ADD COLUMN "WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID"' in migration
    assert 'CREATE TABLE "TENANT_WHATSAPP_CONNECTIONS"' in migration
    assert 'CREATE UNIQUE INDEX "TENANT_WHATSAPP_CONNECTIONS_WABA_ID_KEY"' in migration
    assert 'CREATE UNIQUE INDEX "TENANT_WHATSAPP_CONNECTIONS_PHONE_NUMBER_ID_KEY"' in migration
    for destructive in ('DROP TABLE', 'DROP COLUMN', 'DELETE FROM', 'TRUNCATE', 'UPDATE "', 'INSERT INTO'):
        assert destructive not in migration


def test_platform_admin_has_dedicated_whatsapp_embedded_signup_config():
    schema = read('prisma/schema.prisma')
    service = read('lib/meta/platform-settings.ts')
    route = read('app/api/admin/integrations/meta/route.ts')
    page = read('app/admin/(secure)/integrations/page.tsx')
    assert 'whatsappEmbeddedSignupConfigId' in schema
    assert 'getPlatformWhatsAppEmbeddedSignupCredentials' in service
    assert 'isPlatformWhatsAppEmbeddedSignupAvailable' in service
    assert 'whatsappEmbeddedSignupConfigId' in route
    assert 'WhatsApp Embedded Signup — Configuration ID' in page


def test_signup_config_is_tenant_and_purpose_bound_without_secrets():
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
    response = route.split('const response = NextResponse.json({', 1)[1].split('});', 1)[0]
    assert 'appSecret' not in response
    assert 'accessToken' not in response


def test_completion_revalidates_waba_phone_and_scopes_before_persistence():
    route = read('app/api/integrations/whatsapp/embedded-signup/complete/route.ts')
    helper = read('lib/meta/whatsapp.ts')
    assert 'verifyMetaOAuthStateForPurpose' in route
    assert 'META_WHATSAPP_ONBOARDING_PURPOSE' in route
    assert 'exchangeWhatsAppEmbeddedSignupCode' in route
    assert 'validateWhatsAppEmbeddedSignupToken' in route
    assert 'validateWhatsAppWabaPhoneSelection' in route
    assert 'subscribeAppToWhatsAppWaba' in route
    assert "tenantId: { not: session.tenantId }" in route
    assert 'encryptIntegrationSecret(exchanged.accessToken)' in route
    assert 'prisma.$transaction' in route
    assert 'WHATSAPP_EMBEDDED_SIGNUP_CONNECTED' in route
    assert 'accessTokenEncrypted' not in route.split('return clearSignupState(NextResponse.json({', 1)[1]
    assert "'whatsapp_business_management'" in helper
    assert "'whatsapp_business_messaging'" in helper
    assert 'managementTargets.includes(input.wabaId)' in helper
    assert '/phone_numbers' in helper
    assert "fields: 'id,display_phone_number,verified_name,quality_rating'" in helper
    assert '/subscribed_apps' in helper
    assert "method: 'POST'" in helper


def test_tenant_connection_status_never_returns_encrypted_token():
    route = read('app/api/integrations/whatsapp/connection/route.ts')
    assert "withPermission('INTEGRATIONS_VIEW'" in route
    assert "withPermission('INTEGRATIONS_EDIT'" in route
    assert 'accessTokenEncrypted' not in route
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
