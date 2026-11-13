"""Who sees which WhatsApp number: every Inbox list and conversation goes through the number scope,
and sending through a number checks it too."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_inbox_scope_always_carries_the_number_scope():
    access = read("lib/inbox/access.ts")
    assert "const numberScope = session.numberScope ?? await loadNumberScope(session);" in access
    assert "const numbers = numberScopeWhere(session.numberScope);" in access


def test_every_inbox_reader_uses_the_scope():
    for path in ("app/api/inbox/conversations/route.ts", "app/api/inbox/unanswered/route.ts",
                 "app/api/notifications/messages/route.ts", "app/api/notifications/unread-conversations/route.ts"):
        assert "withInboxScope(session)" in read(path), path


def test_sending_checks_the_number():
    outbound = read("lib/meta/whatsapp-outbound.ts")
    assert "if (!mayUseNumber(await loadNumberScope({ tenantId: input.tenantId, userId: input.userId, role }), conversation)) {" in outbound


def test_migration_is_additive():
    sql = read("prisma/migrations/20261120120000_whatsapp_number_access/migration.sql").upper()
    assert "CREATE TABLE IF NOT EXISTS" in sql
    statements = [line.strip() for line in sql.splitlines() if line.strip() and not line.strip().startswith("--")]
    for word in ("DROP ", "ALTER TABLE", "DELETE ", "UPDATE ", "TRUNCATE"):
        assert not any(line.startswith(word) for line in statements), word
