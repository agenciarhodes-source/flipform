from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_group_can_have_a_gestor_who_is_gestor_inside_each_company():
    groups = read("lib/business-groups.ts")
    assert "export type BusinessGroupRole = 'owner' | 'admin' | 'manager' | 'viewer';" in groups
    assert "if (role === 'manager') return 'manager';" in groups
    assert "manager: 'Gestor do grupo'," in read("app/admin/(secure)/groups/page.tsx")
    assert "z.enum(['owner', 'admin', 'manager', 'viewer'])" in read("app/api/admin/business-groups/[id]/route.ts")
    assert "role IN ('owner', 'admin', 'manager')" in read("lib/business-group-memberships.ts")
    migration = read("prisma/migrations/20261019120000_business_group_manager_role/migration.sql")
    assert "CHECK (role IN ('owner', 'admin', 'manager', 'viewer'))" in migration
