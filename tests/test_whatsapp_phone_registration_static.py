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


def test_registration_serializes_against_binding_replacement():
    route = read('app/api/integrations/whatsapp/registration/route.ts')
    assert 'prisma.$transaction' in route
    assert 'tx.$queryRaw' in route
    assert 'FROM public.tenants' in route
    assert 'WHERE id = ${session.tenantId}' in route
    assert 'FOR UPDATE' in route
    assert 'current.id !== connection.id' in route
    assert 'current.wabaId !== connection.wabaId' in route
    assert 'current.phoneNumberId !== connection.phoneNumberId' in route
    assert 'current.connectedAt.getTime() !== connection.connectedAt.getTime()' in route
    assert 'WHATSAPP_BINDING_CHANGED' in route
    assert 'bindingConnectedAt: current.connectedAt.toISOString()' in route
    registration_call = route.split('await registerWhatsAppPhoneNumber', 1)[1]
    assert 'phoneNumberId: current.phoneNumberId' in registration_call


def test_registration_never_persists_or_logs_pin():
    route = read('app/api/integrations/whatsapp/registration/route.ts')
    audit = route.split("action: 'WHATSAPP_PHONE_REGISTERED'", 1)[1]
    assert 'parsed.data.pin' not in audit
    assert 'pin:' not in audit
    assert 'bindingConnectedAt' in audit
    assert 'phoneNumberId' in audit
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

    availability = settings.split('export async function isPlatformWhatsAppRuntimeAvailable', 1)[1].split('export async function getPlatformWhatsAppEmbeddedSignupClientConfig', 1)[0]
    assert 'appId: true' in availability
    assert 'appSecretEncrypted: true' in availability
    assert 'whatsappSystemUserAccessTokenEncrypted: true' in availability
    assert 'whatsappEmbeddedSignupConfigId' not in availability
    assert 'whatsappBusinessId' not in availability
    assert 'whatsappSystemUserId' not in availability
    assert 'whatsappAdminSystemUserAccessTokenEncrypted' not in availability


def test_connection_registration_marker_is_bound_to_phone_and_binding_version():
    route = read('app/api/integrations/whatsapp/connection/route.ts')
    helper = read('lib/meta/whatsapp-connection-health.ts')
    assert 'isPlatformWhatsAppRuntimeAvailable' in route
    assert 'runtimeAvailable' in route
    assert 'getWhatsAppRegisteredAt' in route
    assert "action: WHATSAPP_PHONE_REGISTERED_ACTION" in helper
    assert "const WHATSAPP_PHONE_REGISTERED_ACTION = 'WHATSAPP_PHONE_REGISTERED'" in helper
    assert 'entityId: input.connectionId' in helper
    assert 'createdAt: { gte: input.connectedAt }' in helper
    assert 'metadata.phoneNumberId === input.phoneNumberId' in helper
    assert 'metadata.bindingConnectedAt === bindingConnectedAt' in helper
    assert 'registeredAt' in route
    safe = route.split('function toSafeConnection', 1)[1].split('export const GET', 1)[0]
    assert 'phoneNumberId:' not in safe
    assert 'accessToken' not in route
    assert 'appSecret' not in route


def test_registration_ui_keeps_pin_ephemeral_and_uses_runtime_readiness():
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
    assert 'const [runtimeAvailable, setRuntimeAvailable]' in ui
    assert 'setRuntimeAvailable(Boolean(data.runtimeAvailable))' in ui
    assert 'disabled={registering || connecting || disconnecting || !runtimeAvailable}' in ui
    assert 'disabled={registering || connecting || disconnecting || !runtimeAvailable || pin.length !== 6}' in ui
    assert "connected && !runtimeAvailable" in ui


def test_registration_pr_requires_no_schema_or_customer_data_mutation():
    schema = read('prisma/schema.prisma')
    whatsapp = schema.split('model TenantWhatsAppConnection {', 1)[1].split('\n}', 1)[0]
    assert 'pin' not in whatsapp.lower()
    assert 'accessTokenEncrypted' not in whatsapp
    route = read('app/api/integrations/whatsapp/registration/route.ts')
    for forbidden in ('prisma.lead.', 'prisma.message.', 'prisma.conversation.', 'prisma.pipeline.'):
        assert forbidden not in route
