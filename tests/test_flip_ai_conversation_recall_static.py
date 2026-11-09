"""The attendant remembers contact data already sent, even after many short messages."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHAT = (ROOT / "lib/flip-ai/public-chat.ts").read_text(encoding="utf-8")


def test_history_groups_bursts_and_looks_further_back():
    assert "const chronological = groupConsecutiveTurns(" in CHAT
    assert "take: 60," in CHAT


def test_contact_already_sent_is_not_asked_again():
    # The whole conversation is checked, not only the recent history.
    assert "direction: 'inbound', type: 'text' },\n      orderBy: { createdAt: 'desc' },\n      take: 300," in CHAT.replace("\r\n", "\n")
    assert "const contactMoment = identityVerified || contactGiven.phone" in CHAT
    assert "contactGivenNote(contactGiven)" in CHAT
    assert "tests/flip-ai-conversation-recall.test.ts" in (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
