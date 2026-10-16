from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_message_icon_counts_unread_conversations_until_each_is_opened():
    route = read("app/api/notifications/unread-conversations/route.ts")
    assert "withPermission('INBOX_VIEW'" in route
    assert "...getInboxConversationWhere(session)," in route
    assert "unreadCount: { gt: 0 }," in route
    for write in (".create(", ".update(", ".delete("):
        assert write not in route
    center = read("components/message-notification-center.tsx")
    assert "Conversas não lidas" in center
    assert "markAllSeen" not in center  # opening the menu no longer clears the number
    assert "window.addEventListener('flipform:inbox-read', onRead);" in center
    assert "window.dispatchEvent(new Event('flipform:inbox-read'));" in read("app/(app)/inbox/inbox-client.tsx")


def test_templates_load_and_a_new_conversation_stays_open():
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "if (templatesRequestRef.current !== conversationId) return;" in inbox
    assert "const keepId = requestedId || selectedIdRef.current;" in inbox


def test_conversation_header_says_when_the_customer_last_wrote():
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "`Última mensagem do cliente ${lastCustomerMessageLabel(selected.lastInboundAt)}`" in inbox
