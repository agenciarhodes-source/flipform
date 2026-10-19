from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_columns_are_additive():
    migration = read("prisma/migrations/20261020150000_whatsapp_ai_pause/migration.sql")
    assert migration.count("ADD COLUMN IF NOT EXISTS") == 4
    for forbidden in ("DROP", "DELETE", "UPDATE ", "NOT NULL"):
        assert forbidden not in migration


def test_a_person_answering_pauses_the_ai_in_that_conversation():
    for path in ("app/api/conversations/[id]/messages/whatsapp/route.ts",
                 "app/api/conversations/[id]/messages/whatsapp-template/route.ts"):
        assert "reason: 'human_reply_system'" in read(path)
    runtime = read("lib/meta/whatsapp-runtime.ts")
    assert "reason: 'human_reply_phone'," in runtime
    pause = read("lib/whatsapp-ai/pause.ts")
    assert "action: 'whatsapp_ai.paused'," in pause and "action: 'whatsapp_ai.resumed'," in pause
    assert "if (!resumeAfterHours) return true;" in pause  # empty: only a person hands it back


def test_inbox_lets_the_team_take_over_and_hand_back():
    route = read("app/api/inbox/conversations/[id]/ai/route.ts")
    assert "withPermission('INBOX_MANAGE'" in route
    assert "findAccessibleInboxConversation(session, ctx.params.id)" in route
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "Pausar IA e assumir" in inbox and "Devolver para a IA" in inbox
    assert "{whatsappAi.enabled && selected.channel === 'whatsapp' ? (" in inbox
