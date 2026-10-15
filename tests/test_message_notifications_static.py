from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_message_notifications_follow_inbox_visibility_and_open_the_conversation():
    route = read("app/api/notifications/messages/route.ts")
    assert "withPermission('INBOX_VIEW'" in route
    assert "conversation: getInboxConversationWhere(session)," in route
    assert "direction: 'inbound'," in route
    assert "href: `/inbox?conversationId=${encodeURIComponent(message.conversationId)}`," in route
    for write in (".update(", ".create(", ".delete(", "updateMany"):
        assert write not in route
    # The first call only sets the starting point: old messages are never announced.
    assert "if (!afterRaw) {" in route
    shell = read("components/app-shell.tsx")
    assert "<MessageNotificationCenter tenantId={session.tenantId} userId={session.userId} />" in shell
    assert "tests/notification-message-feed.test.ts" in read(".github/workflows/ci.yml")


def test_inbox_can_show_only_unread_conversations():
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "const scoped = onlyUnread ? conversations.filter((conversation) => conversation.unreadCount > 0) : conversations;" in inbox
    assert "Não lidas{unreadTotal ? ` (${unreadTotal})` : ''}" in inbox
