from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_stage_moves_start_as_suggestions_and_follow_the_kanban_rules():
    migration = read("prisma/migrations/20261021150000_whatsapp_ai_stage_moves/migration.sql")
    assert "\"stage_mode\" TEXT NOT NULL DEFAULT 'suggest'" in migration
    assert "DROP" not in migration and "flip_ai_" not in migration
    suggestions = read("lib/whatsapp-ai/stage-suggestions.ts")
    assert "if (autoMove) {" in suggestions
    assert "status: 'pending'," in suggestions
    move = read("lib/leads/move-stage.ts")
    assert "dispatchKanbanStageTracking({" in move and "enqueueGoogleConversionEvents({" in move
    rules = read("lib/whatsapp-ai/stage-rules.ts")
    # never backwards, except to an outcome such as "Não qualificado" or "Já é cliente"
    assert "if (stage.orderIndex < input.lead.stageOrderIndex && !OUTCOME_STAGE.test(stage.name)) continue;" in rules
    assert "if (input.lead.status !== 'open') return [];" in rules


def test_people_approve_suggestions_where_they_work():
    route = read("app/api/stage-suggestions/[id]/route.ts")
    assert "withPermission('LEADS_MOVE'" in route
    assert "canMoveLead(session.role, suggestion.lead, session.userId)" in route
    assert "<StageSuggestionBanner leadId={leadId}" in read("components/lead-detail-modal.tsx")
    assert "<StageSuggestionBanner key={selected.lead.id} leadId={selected.lead.id} />" in read("app/(app)/inbox/inbox-client.tsx")
    assert "kind: 'stage_suggestion'," in read("lib/flip/alerts.ts")
    assert "tests/whatsapp-ai-stage-rules.test.ts" in read(".github/workflows/ci.yml")
