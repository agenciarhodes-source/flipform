from pathlib import Path

ROOT = Path(__file__).parents[1]

def read(path): return (ROOT / path).read_text()

def test_platform_meta_model_is_global_and_additive():
    schema = read('prisma/schema.prisma')
    model = schema.split('model PlatformMetaSettings {', 1)[1].split('\n}', 1)[0]
    assert 'tenantId' not in model
    assert '@@map("platform_meta_settings")' in model
    migration = read('prisma/migrations/20260809150000_add_platform_meta_settings/migration.sql').upper()
    assert 'CREATE TABLE' in migration
    assert all(word not in migration for word in ('DROP TABLE', 'DROP COLUMN', 'DELETE FROM', 'TRUNCATE'))

def test_admin_route_is_strict_and_platform_protected():
    route = read('app/api/admin/integrations/meta/route.ts')
    assert route.count('withPlatformAdmin') >= 3
    assert '.strict()' in route
    assert 'redirectUri:' not in route

def test_secret_and_singleton_guards():
    service = read('lib/meta/platform-settings.ts')
    assert "PLATFORM_META_SETTINGS_ID = 'meta'" in service
    assert 'encryptIntegrationSecret(input.appSecret)' in service
    assert 'looksMaskedSecret(input.appSecret)' in service
    assert 'appSecretMasked: maskSecretFromEncrypted(appSecretEncrypted)' in service
    assert 'whatsappAdminSystemUserAccessTokenMasked: maskSecretFromEncrypted(whatsappAdminTokenEncrypted)' in service
    assert 'whatsappSystemUserAccessTokenMasked: maskSecretFromEncrypted(whatsappRuntimeTokenEncrypted)' in service
    assert 'upsert' in service
    dto = service.split('function toAdminDto', 1)[1].split('export async function', 1)[0]
    assert 'appSecretEncrypted:' not in dto
    assert 'appSecret:' not in dto
    assert 'whatsappAdminSystemUserAccessTokenEncrypted:' not in dto
    assert 'whatsappSystemUserAccessTokenEncrypted:' not in dto
