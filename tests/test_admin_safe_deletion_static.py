from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_platform_access_delete_removes_only_allowlist_authorization():
    route = read('app/api/admin/allowed-users/[id]/route.ts')
    page = read('app/admin/(secure)/access/page.tsx')

    assert 'export async function DELETE' in route
    assert 'prisma.allowedUser.delete' in route
    assert "action: 'allowlist.email.deleted'" in route
    assert "method: 'DELETE'" in page
    assert 'window.confirm' in page
    assert 'Usuário, empresa e dados foram preservados' in page

    forbidden = [
        'prisma.user.delete',
        'prisma.tenant.delete',
        'prisma.tenantUser.delete',
        'prisma.lead.delete',
        'deleteMany({ where: { tenantId',
    ]
    for token in forbidden:
        assert token not in route


def test_business_group_delete_removes_only_group_and_cascaded_links():
    route = read('app/api/admin/business-groups/[id]/route.ts')
    page = read('app/admin/(secure)/groups/page.tsx')
    schema = read('prisma/migrations/20260903233000_add_business_groups/migration.sql').lower()

    assert 'export const DELETE = withPlatformAdmin' in route
    assert 'DELETE FROM business_groups' in route
    assert "action: 'business_group.deleted'" in route
    assert "method: 'DELETE'" in page
    assert 'window.confirm' in page
    assert 'As empresas, usuários, leads, formulários, pipelines, integrações, credenciais e demais dados NÃO serão apagados.' in page

    assert 'group_id text not null references business_groups(id) on delete cascade' in schema
    assert 'tenant_id text not null references tenants(id) on delete cascade' in schema
    assert 'user_id text not null references users(id) on delete cascade' in schema

    forbidden = [
        'DELETE FROM tenants',
        'DELETE FROM users',
        'DELETE FROM leads',
        'prisma.tenant.delete',
        'prisma.user.delete',
        'prisma.lead.delete',
    ]
    for token in forbidden:
        assert token not in route
