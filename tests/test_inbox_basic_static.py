from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_inbox_permissions_and_navigation_are_explicit():
    rbac = read('lib/rbac.ts')
    shell = read('components/app-shell.tsx')
    page = read('app/(app)/inbox/page.tsx')

    assert "INBOX_VIEW: ['owner', 'admin', 'manager', 'agent', 'viewer']" in rbac
    assert "INBOX_MANAGE: ['owner', 'admin', 'manager', 'agent']" in rbac
    assert "viewer" not in rbac[rbac.index("INBOX_MANAGE:"):rbac.index("KANBAN_VIEW_ALL:")]
    assert 'href: "/inbox"' in shell
    assert 'permission: "INBOX_VIEW"' in shell
    assert "can(session.role, 'INBOX_VIEW')" in page
    assert "can(session.role, 'LEADS_CONTACT_WHATSAPP')" in page


def test_inbox_access_scope_is_tenant_safe_and_agents_are_assignment_scoped():
    src = read('lib/inbox/access.ts')

    assert "tenantId: session.tenantId" in src
    assert "session.role !== 'agent'" in src
    assert "{ assignedTo: session.userId }" in src
    assert "lead: { is: { assignedTo: session.userId } }" in src
    assert "findAccessibleInboxConversation" in src
    assert "id," in src
    assert "...getInboxConversationWhere(session)" in src


def test_inbox_read_routes_use_server_session_and_permissions():
    conversations = read('app/api/inbox/conversations/route.ts')
    messages = read('app/api/inbox/conversations/[id]/messages/route.ts')
    mark_read = read('app/api/inbox/conversations/[id]/read/route.ts')

    assert "withPermission('INBOX_VIEW'" in conversations
    assert "getInboxConversationWhere(session)" in conversations
    assert "take: 100" in conversations
    assert "withPermission('INBOX_VIEW'" in messages
    assert "findAccessibleInboxConversation(session, ctx.params.id)" in messages
    assert "tenantId: session.tenantId" in messages
    assert "conversationId: conversation.id" in messages
    assert "take: 200" in messages
    assert "withPermission('INBOX_MANAGE'" in mark_read
    assert "findAccessibleInboxConversation(session, ctx.params.id)" in mark_read
    assert "tenantId: session.tenantId" in mark_read
    assert "unreadCount: { gt: 0 }" in mark_read
    assert "data: { unreadCount: 0 }" in mark_read


def test_inbox_client_cannot_choose_provider_assets_or_recipient():
    client = read('app/(app)/inbox/inbox-client.tsx')

    assert "/api/conversations/${encodeURIComponent(selected.id)}/messages/whatsapp" in client
    assert "idempotencyKey: createIdempotencyKey()" in client
    assert "text," in client
    send_segment = client[client.index("async function sendMessage()"):client.index("return (", client.index("async function sendMessage()"))]
    assert "phoneNumberId" not in send_segment
    assert "waba" not in send_segment.lower()
    assert "recipient" not in send_segment.lower()
    assert "accessToken" not in send_segment
    assert "appSecret" not in send_segment


def test_inbox_does_not_add_or_mutate_prisma_schema():
    # PR #198 deliberately reuses Conversation/Message from the existing core.
    assert not (ROOT / 'prisma/migrations/20260816_add_inbox').exists()
    client = read('app/(app)/inbox/inbox-client.tsx')
    assert "fetch('/api/inbox/conversations'" in client
    assert "unreadCount" in client
