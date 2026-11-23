from pathlib import Path

ROUTE = Path(__file__).resolve().parents[1] / 'app' / 'api' / 'forms' / '[id]' / 'assignment-rotation' / 'route.ts'


def test_rotation_get_hides_members_who_are_no_longer_active_agents():
    text = ROUTE.read_text(encoding='utf-8')
    assert ".filter((m) => m.user.tenantUsers.some((t) => t.role === 'agent' && t.status === 'active'))" in text
    # The save stays strict: only active agents of the same company.
    assert "role: 'agent', status: 'active'" in text
