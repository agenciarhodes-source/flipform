from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def test_manager_sees_settings_navigation_through_branding_permission():
    shell = read('components/app-shell.tsx')
    page = read('app/(app)/settings/page.tsx')
    assert 'permission: "BRANDING_VIEW"' in shell
    assert "if (!can(session.role, 'BRANDING_VIEW'))" in page

def test_manager_can_edit_only_name_logo_and_primary_color():
    client = read('components/settings-page-client.tsx')
    schema = read('lib/schemas-tenant.ts')
    assert "const canBrandingEdit = can(role, 'BRANDING_EDIT')" in client
    assert "const canFullEdit = can(role, 'SETTINGS_EDIT')" in client
    assert "'/api/settings/branding'" in client
    assert "Somente o Dono da empresa pode alterar o slug." in client
    assert 'disabled={!canFullEdit}' in client
    assert 'disabled={!canBrandingEdit}' in client

    start = schema.index('export const tenantBrandingUpdateSchema')
    end = schema.index('export const tenantUpdateSchema', start)
    limited = schema[start:end]
    assert 'name:' in limited
    assert 'primaryColor:' in limited
    assert 'logoUrl:' in limited
    assert 'slug:' not in limited

def test_branding_endpoint_never_changes_slug_integrations_or_operational_data():
    route = read('app/api/settings/branding/route.ts')
    assert "withPermission('BRANDING_EDIT'" in route
    assert 'tenantBrandingUpdateSchema.safeParse' in route
    assert 'name?: string' in route
    assert 'primaryColor?: string' in route
    assert 'logoUrl?: string | null' in route
    assert "action: 'tenant.branding_updated'" in route
    for forbidden in [
        'updates.slug',
        'tenantMetaConnection',
        'tenantWhatsAppConnection',
        'tenantInstagramConnection',
        'prisma.lead',
        'prisma.form',
        'prisma.pipeline',
        'ALTER TABLE',
        'CREATE TABLE',
    ]:
        assert forbidden not in route

def test_manager_limited_copy_explains_protected_areas():
    client = read('components/settings-page-client.tsx')
    assert 'Seu acesso permite editar somente a' in client
    assert 'nome, logo e cor principal' in client
    assert 'Slug, integrações, usuários, financeiro e configurações críticas continuam protegidos.' in client
