from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_inbox_can_show_only_lead_conversations_and_tags_each_one():
    inbox = (ROOT / "app/(app)/inbox/inbox-client.tsx").read_text(encoding="utf-8")
    assert "(!onlyUnread || conversation.unreadCount > 0) && (!onlyLeads || conversation.lead)" in inbox
    assert "Com lead{leadTotal ? ` (${leadTotal})` : ''}" in inbox
    assert ">Lead</span>" in inbox and ">Sem lead</span>" in inbox
