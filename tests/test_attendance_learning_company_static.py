from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_learnings_belong_to_the_company_and_reach_every_attendant():
    learning = read("lib/flip/learning.ts")
    # Every attendant of the same company, never another company.
    assert "where: { tenantId, status: { in: ['draft', 'published'] } }," in learning
    assert "for (const agent of agents) {" in learning
    assert "replaceLearningSection(master.content, approved)" in learning
    # Failures and AI supervision feed the same approval list.
    assert "NÃO DEU CERTO" in learning and "origin: 'ai_review'" in learning
    migration = read("prisma/migrations/20261026120000_attendance_learning_company_base/migration.sql")
    assert 'ADD COLUMN IF NOT EXISTS "origin"' in migration and 'ADD COLUMN IF NOT EXISTS "topic"' in migration
    assert "'avoid'" in migration
    assert "withPermission('FLIP_AI_MANAGE'" in read("app/api/flip/learning/sync/route.ts")
