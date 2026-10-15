from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_clicking_the_contact_opens_the_lead_card_or_finds_it_by_phone():
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "onClick={() => void openLead(selected)}" in inbox
    assert "<LeadDetailModal leadId={leadModal.leadId}" in inbox
    match = read("app/api/inbox/conversations/[id]/match-lead/route.ts")
    assert "findAccessibleInboxConversation(session, ctx.params.id)" in match
    assert "linkWhatsAppConversationToMatchingLead({ tenantId: session.tenantId, conversationId: conversation.id })" in match


def test_a_conversation_can_be_marked_unread_from_the_right_click_menu():
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "onContextMenu={(event) => {" in inbox
    assert "Marcar como não lida" in inbox
    unread = read("app/api/inbox/conversations/[id]/unread/route.ts")
    assert "withPermission('INBOX_MANAGE'" in unread
    assert "where: { id: conversation.id, tenantId: session.tenantId, unreadCount: 0 }," in unread
