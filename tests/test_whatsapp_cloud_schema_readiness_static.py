from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_whatsapp_schema_repair_is_manual_additive_and_idempotent():
    script = read('scripts/repair-whatsapp-cloud-schema.ts')
    workflow = read('.github/workflows/repair-whatsapp-cloud-schema.yml')

    assert 'whatsapp_embedded_signup_config_id' in script
    assert 'whatsapp_business_id' in script
    assert 'whatsapp_system_user_id' in script
    assert 'whatsapp_admin_system_user_access_token_encrypted' in script
    assert 'whatsapp_system_user_access_token_encrypted' in script
    assert 'CREATE TABLE IF NOT EXISTS public.tenant_whatsapp_connections' in script
    assert 'CREATE UNIQUE INDEX IF NOT EXISTS tenant_whatsapp_connections_waba_id_key' in script
    assert 'CREATE UNIQUE INDEX IF NOT EXISTS tenant_whatsapp_connections_phone_number_id_key' in script
    assert "conname = 'tenant_whatsapp_connections_tenant_id_fkey'" in script
    assert 'schema ready' in script

    for destructive in ('DROP TABLE', 'DROP COLUMN', 'TRUNCATE ', 'DELETE FROM', 'UPDATE public.'):
        assert destructive not in script.upper()

    assert 'workflow_dispatch:' in workflow
    assert 'push:' not in workflow
    assert 'pull_request:' not in workflow
    assert 'npx tsx scripts/repair-whatsapp-cloud-schema.ts' in workflow


def test_connection_endpoint_reports_schema_drift_as_json_503():
    route = read('app/api/integrations/whatsapp/connection/route.ts')

    assert "error.code === 'P2021' || error.code === 'P2022'" in route
    assert "WHATSAPP_SCHEMA_NOT_READY" in route
    assert "schemaReady: false" in route
    assert "platformAvailable: false" in route
    assert "runtimeAvailable: false" in route
    assert "connection: null" in route
    assert "{ status: 503 }" in route
    assert "schemaReady: true" in route
    assert "withPermission('INTEGRATIONS_VIEW'" in route
    assert "withPermission('INTEGRATIONS_EDIT'" in route


def test_repair_does_not_seed_credentials_or_customer_connections():
    script = read('scripts/repair-whatsapp-cloud-schema.ts')

    assert 'INSERT INTO' not in script.upper()
    assert 'app_id =' not in script.lower()
    assert 'access token' not in script.lower()
    assert 'waba_id =' not in script.lower()
    assert 'phone_number_id =' not in script.lower()
