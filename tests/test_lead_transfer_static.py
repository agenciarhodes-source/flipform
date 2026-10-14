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


def test_portfolio_transfer_is_manager_only_moves_open_leads_with_conversations_and_is_audited():
    route = read("app/api/leads/transfer-portfolio/route.ts")
    assert route.count("withPermission('LEADS_EDIT_ALL'") == 2
    assert "where: { tenantId: session.tenantId, assignedTo: fromUserId, status: 'open' }," in route
    assert "{ leadId: { in: leadIds } }" in route
    assert "action: 'lead.portfolio_transferred'," in route
    assert "role: 'agent', status: 'active' }" in route
    assert ".delete(" not in route and "deleteMany" not in route
    assert "<PortfolioTransferDialog onDone={load} />" in read("app/(app)/leads/page.tsx")


def test_unanswered_alert_is_read_only_and_scoped_like_the_inbox():
    route = read("app/api/inbox/unanswered/route.ts")
    assert "...getInboxConversationWhere(session)," in route
    assert "withPermission('INBOX_VIEW'" in route
    for write in (".update(", ".create(", ".delete(", "updateMany", "createMany"):
        assert write not in route
    assert "<UnansweredConversationsAlert />" in read("components/app-shell.tsx")
    assert "tests/inbox-unanswered.test.ts" in read(".github/workflows/ci.yml")
