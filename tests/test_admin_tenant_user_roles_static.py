from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def test_platform_admin_can_change_tenant_user_role_from_owner_to_manager():
    route = read('app/api/admin/tenants/[id]/users/[tenantUserId]/role/route.ts')
    assert 'withPlatformAdmin' in route
    assert "z.enum(['owner', 'admin', 'manager', 'agent', 'viewer'])" in route
    assert 'tenantId: ctx.params.id' in route
    assert 'id: ctx.params.tenantUserId' in route
    assert 'tx.tenantUser.update' in route
    assert 'data: { role: parsed.data.role }' in route
    assert "action: 'platform.tenant_user_role_changed'" in route

def test_role_change_keeps_allowed_user_role_in_sync_without_resetting_password():
    route = read('app/api/admin/tenants/[id]/users/[tenantUserId]/role/route.ts')
    assert 'tx.allowedUser.findUnique' in route
    assert 'tx.allowedUser.update' in route
    assert 'tx.allowedUser.create' in route
    assert "source: 'platform_tenant_role_change'" in route
    assert 'passwordHash' not in route

def test_admin_tenant_page_exposes_full_operational_hierarchy_and_role_editor():
    page = read('app/admin/(secure)/tenants/[id]/page.tsx')
    for label in ['Dono da empresa', 'Administrador', 'Gestor', 'Atendente/Vendedor', 'Visualizador']:
        assert label in page
    assert 'Hierarquia da empresa:' in page
    assert 'saveUserRole' in page
    assert '/users/${tenantUser.id}/role' in page
    assert 'Salvar nível' in page

def test_store_manager_role_uses_existing_tenant_team_hierarchy_model():
    docs = read('docs/operations/team-hierarchy.md')
    source = read('lib/team-hierarchy.ts')
    assert 'Gestor → Atendentes' in docs
    assert "role === 'admin' || role === 'manager'" in source
    assert "member.role === 'agent'" in source
    assert 'visibleAgentUserIds' in source

def test_role_editor_does_not_touch_leads_or_integrations():
    route = read('app/api/admin/tenants/[id]/users/[tenantUserId]/role/route.ts')
    for forbidden in [
        'prisma.lead',
        'tx.lead',
        'tenantMetaConnection',
        'tenantWhatsAppConnection',
        'tenantInstagramConnection',
        'metaAccessToken',
        'ALTER TABLE',
        'CREATE TABLE',
    ]:
        assert forbidden not in route
