from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_changing_the_lead_owner_moves_its_conversations_with_history():
    route = read("app/api/leads/[id]/route.ts")
    assert "&& allowed.assignedTo !== lead.assignedTo;" in route
    assert "where: { tenantId: session.tenantId, leadId: lead.id, provider: 'meta' }," in route
    assert "data: { assignedTo: allowed.assignedTo }," in route
    assert "previousAssignedTo: lead.assignedTo, conversationsTransferred" in route
    # Messages stay on the conversation: nothing is copied, moved between conversations or deleted.
    put = route.split("export const PUT", 1)[1].split("export const DELETE", 1)[0]
    assert "message.update" not in put and "message.delete" not in put
    # Attendants still cannot hand their leads to someone else.
    assert "? ['name', 'email', 'phone', 'temperature']" in put


def test_managers_can_pause_attendants_in_the_rotation():
    assert "LEAD_ASSIGNMENT_ROTATION_MANAGE: ['owner', 'admin', 'manager']," in read("lib/rbac.ts")
