from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_inbox_crm_actions_are_tenant_scoped_and_locked():
    source = read("lib/inbox/actions.ts")
    assert "tenant_id = ${tenantId}" in source
    assert "FOR UPDATE" in source
    assert "getInboxConversationWhere(session)" in source
    assert "tenantId: input.session.tenantId" in source


def test_agent_can_only_link_leads_assigned_to_self():
    source = read("lib/inbox/actions.ts")
    assert "input.session.role === 'agent'" in source
    assert "assignedTo: input.session.userId" in source


def test_relinking_an_existing_different_lead_is_blocked():
    source = read("lib/inbox/actions.ts")
    assert "conversation.leadId && conversation.leadId !== lead.id" in source
    assert "ALREADY_LINKED" in source


def test_assignment_is_manager_only_and_rejects_viewers():
    source = read("lib/inbox/actions.ts")
    assert "['owner', 'admin', 'manager'].includes(input.session.role)" in source
    assert "membership.role === 'viewer'" in source
    assert "data: { assignedTo: normalizedUserId }" in source


def test_assignment_does_not_silently_change_lead_owner():
    source = read("lib/inbox/actions.ts")
    assign_section = source.split("export async function assignInboxConversation", 1)[1]
    assert "tx.lead.update" not in assign_section
    assert "lead.update" not in assign_section


def test_status_actions_only_change_conversation_state():
    source = read("lib/inbox/actions.ts")
    status_section = source.split("export async function setInboxConversationStatus", 1)[1]
    assert "status: 'resolved'" in status_section
    assert "resolvedAt: null" in status_section
    assert "lead.update" not in status_section
    assert "pipeline" not in status_section.lower()


def test_linkable_lead_search_is_bounded_and_scoped():
    source = read("app/api/inbox/leads/route.ts")
    assert "withPermission('INBOX_MANAGE'" in source
    assert "tenantId: session.tenantId" in source
    assert "take: 20" in source
    assert "q.length < 2" in source


def test_assignee_discovery_is_scoped_and_excludes_viewers():
    source = read("app/api/inbox/assignees/route.ts")
    assert "tenantId: session.tenantId" in source
    assert "status: 'active'" in source
    assert "membership.role !== 'viewer'" in source


def test_browser_never_selects_meta_assets_or_tenant():
    source = read("app/(app)/inbox/conversation-actions.tsx")
    forbidden = ["tenantId", "wabaId", "phoneNumberId", "accessToken", "appSecret"]
    for token in forbidden:
        assert token not in source


def test_ui_exposes_explicit_lead_assignment_and_status_actions():
    source = read("app/(app)/inbox/conversation-actions.tsx")
    assert "/lead`" in source
    assert "/assignee`" in source
    assert "/status`" in source
    assert "Isso não altera o responsável do Lead no Kanban." in source


def test_inbox_selection_updates_ref_synchronously():
    source = read("app/(app)/inbox/inbox-client.tsx")
    assert "selectedIdRef.current = conversationId" in source
    assert "onClick={() => selectConversation(conversation.id)}" in source


def test_no_migration_or_destructive_data_operation_added_by_feature():
    feature_files = [
        "lib/inbox/actions.ts",
        "app/api/inbox/leads/route.ts",
        "app/api/inbox/assignees/route.ts",
        "app/api/inbox/conversations/[id]/lead/route.ts",
        "app/api/inbox/conversations/[id]/assignee/route.ts",
        "app/api/inbox/conversations/[id]/status/route.ts",
        "app/(app)/inbox/conversation-actions.tsx",
    ]
    destructive = ["TRUNCATE ", "DROP TABLE", "DROP COLUMN", "deleteMany(", "updateMany({\n      where: {}"]
    combined = "\n".join(read(path) for path in feature_files)
    for token in destructive:
        assert token not in combined
