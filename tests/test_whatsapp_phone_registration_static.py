from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_registration_accepts_only_pin_and_resolves_assets_server_side():
    route = read('app/api/integrations/whatsapp/registration/route.ts')
    body_schema = route.split('const bodySchema =', 1)[1].split('export const POST', 1)[0]
    assert "withPermission('INTEGRATIONS_EDIT'" in route
    assert "pin: z.string().regex(/^\\d{6}$/)" in body_schema
    assert 'phoneNumberId' not in body_schema
    assert 'wabaId' not in body_schema
    assert 'tenantId' not in body_schema
    assert "tenantId: session.tenantId, status: 'connected'" in route
    assert 'connection.wabaId' in route
    assert 'connection.phoneNumberId' in route
    assert 'validateWhatsAppSystemUserToken' in route
    assert 'validateWhatsAppWabaPhoneSelection' in route
    assert 'registerWhatsAppPhoneNumber' in route
    assert 'getPlatformWhatsAppRuntimeCredentials' in route


def test_registration_never_persists_or_logs_pin():
    route = read('app/api/integrations/whatsapp/registration/route.ts')
    audit = route.split("action: 'WHATSAPP_PHONE_REGISTERED'", 1)[1]
    assert 'parsed.data.pin' not in audit
    assert 'pin:' not in audit
    assert 'console.info' in route
    assert "operation: 'register_phone'" in route
    assert 'console.error' in route
    assert '.update(' not in route
    assert '.updateMany(' not in route
    assert '.delete(' not in route
    assert '.deleteMany(' not in route
    assert "action: 'WHATSAPP_PHONE_REGISTERED'" in route
    assert '.catch(error =>' in route


def test_meta_helper_uses_official_registration_shape():
    helper = read('lib/meta/whatsapp.ts')
    registration = helper.split('export async function registerWhatsAppPhoneNumber', 1)[1]
    assert '/${input.phoneNumberId}/register' in registration
    assert "messaging_product: 'whatsapp'" in registration
    assert 'pin: input.pin' in registration
    assert "method: 'POST'" in registration
    assert 'accessToken: input.accessToken' in registration
    assert "if (!/^\\d{6}$/.test(input.pin))" in registration
    assert "headers['Content-Type'] = 'application/json'" in helper
    assert 'JSON.stringify(input.body)' in helper


def test_registration_uses_runtime_credential_without_admin_token():
    settings = read('lib/meta/platform-settings.ts')
    runtime = settings.split('export async function getPlatformWhatsAppRuntimeCredentials', 1)[1].split('export async function updatePlatformMetaSettings', 1)[0]
    assert 'whatsappSystemUserAccessTokenEncrypted' in runtime
    assert 'decryptIntegrationSecret' in runtime
    assert 'systemUserAccessToken' in runtime
    assert 'whatsappAdminSystemUserAccessTokenEncrypted' not in runtime
    assert 'adminSystemUserAccessToken' not in runtime


def test_connection_registration_marker_is_scoped_to_current_binding_window():
    route = read('app/api/integrations/whatsapp/connection/route.ts')
    assert "action: 'WHATSAPP_PHONE_REGISTERED'" in route
    assert 'entityId: connection.id' in route
    assert 'createdAt: { gte: connection.connectedAt }' in route
    assert 'registeredAt' in route
    assert 'accessToken' not in route
    assert 'appSecret' not in route


def test_registration_ui_keeps_pin_ephemeral():
    ui = read('app/(app)/integrations/whatsapp-embedded-signup-card.tsx')
    assert "fetch('/api/integrations/whatsapp/registration'" in ui
    assert "body: JSON.stringify({ pin })" in ui
    assert 'type="password"' in ui
    assert 'inputMode="numeric"' in ui
    assert 'maxLength={6}' in ui
    assert "setPin('')" in ui
    assert 'localStorage' not in ui
    assert 'sessionStorage' not in ui
    assert 'FlipForm não salva o PIN' in ui


def test_registration_pr_requires_no_schema_or_customer_data_mutation():
    schema = read('prisma/schema.prisma')
    whatsapp = schema.split('model TenantWhatsAppConnection {', 1)[1].split('\n}', 1)[0]
    assert 'pin' not in whatsapp.lower()
    assert 'accessTokenEncrypted' not in whatsapp
    route = read('app/api/integrations/whatsapp/registration/route.ts')
    for forbidden in ('prisma.lead.', 'prisma.message.', 'prisma.conversation.', 'prisma.pipeline.'):
        assert forbidden not in route
