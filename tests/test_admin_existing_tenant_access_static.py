from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_super_admin_direct_access_defaults_to_existing_tenant():
    page = read('app/admin/(secure)/allowed-users/page.tsx')

    assert "type TenantMode = 'existing' | 'new';" in page
    assert "useState<TenantMode>('existing')" in page
    assert 'Vincular a empresa existente' in page
    assert 'Selecione a empresa existente' in page
    assert "tenantMode === 'existing' && !tenantId" in page
    assert "tenantId: tenantMode === 'existing' ? tenantId : null" in page
    assert 'Nenhuma nova empresa será criada' in page
    assert 'Atenção: esta opção cria um novo tenant.' in page


def test_admin_api_already_returns_tenants_for_safe_selection():
    route = read('app/api/admin/allowed-users/route.ts')
    page = read('app/admin/(secure)/allowed-users/page.tsx')

    assert 'prisma.tenant.findMany' in route
    assert 'adminOk({ items, accounts, tenants, plans })' in route
    assert "setTenants(Array.isArray(data.data?.tenants) ? data.data.tenants : [])" in page


def test_manual_access_reuses_existing_tenant_when_tenant_id_is_supplied():
    service = read('services/admin/manual-access-service.ts')

    assert 'const existingTenant = input.tenantId' in service
    assert 'await tx.tenant.findUnique({ where: { id: input.tenantId } })' in service
    assert 'const resolvedTenant = existingTenant' in service
    assert ': await createInternalTenant' in service
    assert 'where: { tenantId_userId: { tenantId: resolvedTenant.id, userId: user.id } }' in service
    assert 'where: { tenantId_email: { tenantId: resolvedTenant.id, email } }' in service
