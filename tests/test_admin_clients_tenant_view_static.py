from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_admin_clients_route_is_platform_admin_only_and_owner_company_centric():
    route = read("app/api/admin/tenants/route.ts")
    assert "withPlatformAdmin" in route
    assert "prisma.tenant.findMany" in route
    assert "{ tenantUsers: { some: { role: Role.owner } } }" in route
    assert "startsWith: 'internal-'" in route
    assert "startsWith: 'Acesso interno '" in route
    assert "contains: 'internal=true'" in route
    assert "owners: t.tenantUsers.map" in route


def test_admin_clients_search_only_uses_owner_accounts_as_people_filter():
    route = read("app/api/admin/tenants/route.ts")
    assert "role: Role.owner" in route
    assert "{ name: { contains: q, mode: 'insensitive' } }" in route
    assert "{ email: { contains: q, mode: 'insensitive' } }" in route
    assert "role: Role.admin" not in route
    assert "role: Role.manager" not in route
    assert "role: Role.agent" not in route


def test_admin_clients_page_separates_companies_from_access_accounts():
    page = read("app/admin/(secure)/tenants/page.tsx")
    assert ">Clientes<" in page
    assert "Empresas comerciais com perfil Dono da empresa (owner)." in page
    assert "painel Acessos" in page
    assert "Sem dono cadastrado" not in page
    assert "t.owners.map" in page


def test_admin_clients_view_does_not_change_schema_or_operational_data():
    route = read("app/api/admin/tenants/route.ts")
    for forbidden in [
        "prisma.tenant.update",
        "prisma.tenantUser.update",
        "prisma.lead.update",
        "prisma.lead.delete",
        "ALTER TABLE",
        "CREATE TABLE",
    ]:
        assert forbidden not in route
