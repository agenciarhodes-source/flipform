from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = "prisma/migrations/20261008120000_tenant_account_kind/migration.sql"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_client_filter_uses_only_the_explicit_account_kind():
    helper = read("lib/admin/client-tenant-filter.ts")
    assert "function getClientTenantWhere" in helper
    assert "return { accountKind: 'client' };" in helper
    # Names, internal notes and roles are not evidence of what a customer is.
    for heuristic in ["internalNotes", "startsWith", "Role.owner", "tenantUsers"]:
        assert heuristic not in helper, heuristic
    assert "getClientTenantWhere()" in read("app/api/admin/overview/route.ts")


def test_account_kind_values_match_between_code_schema_and_database():
    kinds = read("lib/admin/tenant-account-kind.ts")
    migration = read(MIGRATION)
    schema = read("prisma/schema.prisma")
    assert "['unclassified', 'client', 'internal_test', 'technical_access']" in kinds
    assert "('unclassified', 'client', 'internal_test', 'technical_access')" in migration
    assert 'accountKind   String       @default("unclassified") @map("account_kind")' in schema
    assert "@@index([accountKind])" in schema


def test_migration_is_additive_and_touches_only_the_new_column():
    lines = [line for line in read(MIGRATION).splitlines() if not line.strip().startswith("--")]
    sql = "\n".join(lines).upper()
    for forbidden in ["DROP ", "TRUNCATE", "DELETE FROM", "UPDATE ", "RENAME ", "ALTER COLUMN", "INSERT "]:
        assert forbidden not in sql, forbidden
    assert sql.count("ADD COLUMN") == 1
    assert "DEFAULT 'UNCLASSIFIED'" in sql


def test_admin_clients_route_is_platform_admin_only_and_filters_by_kind():
    route = read("app/api/admin/tenants/route.ts")
    assert "withPlatformAdmin" in route
    assert "prisma.tenant.findMany" in route
    assert "isTenantAccountKind(kind)" in route
    assert "? [{ accountKind: kind }]" in route
    assert ": clientsOnly ? [clientWhere] : [];" in route
    assert "accountKind: t.accountKind," in route


def test_companies_without_an_owner_still_show_a_responsible():
    route = read("app/api/admin/tenants/route.ts")
    assert "const RESPONSIBLE_ROLES: Role[] = [Role.owner, Role.admin, Role.manager];" in route
    assert "owners: pickResponsibles(t.tenantUsers).map" in route
    assert "Role.agent" not in route
    assert "Role.viewer" not in route
    page = read("app/admin/(secure)/tenants/page.tsx")
    assert "(sem dono cadastrado)" in page
    assert "Sem responsável" in page


def test_account_kind_change_is_audited_and_changes_nothing_else():
    route = read("app/api/admin/tenants/[id]/account-kind/route.ts")
    assert "export const PUT = withPlatformAdmin" in route
    assert "tenantAccountKindSchema.safeParse" in route
    assert "data: { accountKind }" in route
    assert "platform.tenant_account_kind_changed" in route
    assert "metadata: { previous: tenant.accountKind, next: accountKind }" in route
    for forbidden in ["tenantStatusHistory", "planId", "tenantUser", "prisma.lead", ".delete(", "deleteMany", "internalNotes"]:
        assert forbidden not in route, forbidden


def test_admin_clients_page_defaults_to_clients_and_lets_the_admin_classify():
    page = read("app/admin/(secure)/tenants/page.tsx")
    assert ">Clientes<" in page
    assert "useState('client')" in page
    assert "if (kind === 'client') params.set('clientsOnly', 'true');" in page
    assert "else if (kind !== 'all') params.set('kind', kind);" in page
    assert "/account-kind" in page
    for label in ["Cliente", "Teste interno", "Acesso técnico", "Não classificado"]:
        assert label in page
    assert "painel Acessos" in page


def test_technical_access_tenants_are_classified_when_created():
    creator = read("lib/admin/create-internal-tenant.ts")
    assert "accountKind: 'technical_access'," in creator


def test_admin_clients_view_does_not_change_operational_data():
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
