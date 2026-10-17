from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_group_owners_and_admins_get_a_gestor_user_in_each_company():
    lib = read("lib/business-group-memberships.ts")
    assert "role IN ('owner', 'admin')" in lib
    assert "role: 'manager', status: 'active'" in lib
    # Only users the group created are turned on or off by it.
    assert "if (!fromGroup) continue;" in lib
    assert "data: { status: 'inactive' }" in lib
    assert ".delete(" not in lib
    route = read("app/api/admin/business-groups/[id]/route.ts")
    assert "await syncBusinessGroupMemberships(prisma, { groupId: ctx.params.id, actorUserId: session.userId });" in route


def test_group_gestores_do_not_take_a_plan_seat_or_receive_leads_automatically():
    assert "countPlanSeatUsers(tenantId)," in read("lib/plan-limits.ts")
    assert "countPlanSeatUsers(session.tenantId)," in read("app/api/invites/route.ts")
    # The automatic distribution only picks attendants, so a Gestor never receives leads by rotation.
    assert "role: 'agent', status: 'active'" in read("lib/lead-assignment.ts")
