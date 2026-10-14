from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_reminders_are_personal_read_only_and_announced_once():
    route = read("app/api/tasks/reminders/route.ts")
    assert "{ assignedTo: session.userId }," in route
    assert "{ assignedTo: null, createdBy: session.userId }," in route
    assert "tenantId: session.tenantId," in route
    for write in (".update(", ".create(", ".delete(", "updateMany"):
        assert write not in route
    alert = read("components/task-reminder-alert.tsx")
    assert "`${task.id}:${task.dueDate}`" in alert
    assert "<TaskReminderAlert />" in read("components/app-shell.tsx")


def test_reminder_is_chosen_on_the_task_and_stored_additively():
    migration = read("prisma/migrations/20261015120000_task_reminders/migration.sql")
    assert 'ADD COLUMN IF NOT EXISTS "remind_minutes_before" INTEGER;' in migration
    assert "DROP" not in migration.upper()
    assert "remindMinutesBefore Int? @map(\"remind_minutes_before\")" in read("prisma/schema.prisma")
    assert "remindMinutesBefore: form.remind === 'none' ? null : Number(form.remind)," in read("components/tasks-tab.tsx")
    assert "tests/task-reminders.test.ts" in read(".github/workflows/ci.yml")
