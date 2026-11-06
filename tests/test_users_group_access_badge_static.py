from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_group_managers_show_as_released_by_the_group():
    api = read("app/api/users/route.ts")
    assert "action: GROUP_MEMBERSHIP_GRANTED, entityId: { in: tenantUsers.map((tu) => tu.id) }" in api
    assert "tenantId: session.tenantId, action: GROUP_MEMBERSHIP_GRANTED" in api
    assert "!allowed && fromGroup.has(tu.id) && tu.status === 'active' ? 'group' : accessStatus(allowed)" in api
    page = read("components/users-page-client.tsx")
    assert "Liberado pelo grupo" in page
