from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_learning_is_anonymous_owner_approved_and_additive():
    migration = read("prisma/migrations/20261025120000_attendance_learning_suggestions/migration.sql")
    assert 'CREATE TABLE IF NOT EXISTS "attendance_learning_suggestions"' in migration
    assert "DROP" not in migration and "flip_ai_" not in migration
    learning = read("lib/flip/learning.ts")
    assert "anonymizeText(" in learning
    assert "messages: { some: { direction: 'outbound', sentByUserId: { not: null }" in learning
    # The Markdown Mestre only changes through an approval, as a new revision.
    assert learning.count("saveMasterMarkdown(") == 1
    assert "expectedRevision: master.revision" in learning
    for route in ("app/api/flip/learning/route.ts", "app/api/flip/learning/[id]/route.ts"):
        assert "withPermission('FLIP_AI_MANAGE'" in read(route)
    assert "isCronRequestAuthorized(req)" in read("app/api/internal/jobs/attendance-learning/route.ts")
