from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_business_group_access_can_send_whatsapp_like_it_can_open_the_company():
    outbound = (ROOT / "lib/meta/whatsapp-outbound.ts").read_text(encoding="utf-8")
    assert "const access = state.accesses.find((group) => group.tenants.some((tenant) => tenant.id === input.tenantId));" in outbound
    assert "role = mapBusinessGroupRoleToTenantRole(access.role);" in outbound
    assert "if (!role || !can(role, 'LEADS_CONTACT_WHATSAPP')) {" in outbound
    assert "if (role === 'agent') {" in outbound
