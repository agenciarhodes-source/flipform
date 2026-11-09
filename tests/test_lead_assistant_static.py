"""Assistente de leads: preview first, confirm to apply, only the Kanban owner changes, and it can be undone."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVICE = (ROOT / "lib/lead-assistant/service.ts").read_text(encoding="utf-8")


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_only_managers_use_it():
    for path in ["app/api/leads/assistant/apply/route.ts", "app/api/leads/assistant/undo/route.ts"]:
        assert "withPermission('LEADS_EDIT_ALL'" in read(path)
    # In the Flip bar, only managers' commands go to the assistant; everything else is "Pergunte ao Flip".
    route = read("app/api/flip/ask/route.ts")
    assert "can(session.role, 'LEADS_EDIT_ALL') && looksLikeLeadCommand(question)" in route
    assert "previewLeadCommand(session, question)" in route
    assert "applyLead" not in route


def test_preview_never_writes():
    preview = SERVICE.split("export async function previewLeadCommand", 1)[1].split("export async function applyLeadPlan", 1)[0]
    for write in ["update(", "updateMany(", "create(", "createMany(", "delete"]:
        assert f"lead.{write}" not in preview
        assert f"auditLog.{write}" not in preview


def test_apply_recomputes_and_only_touches_open_lead_owner():
    apply = SERVICE.split("export async function applyLeadPlan", 1)[1].split("function batchChanges", 1)[0]
    assert "distribution.changes.length !== expectedMoves" in apply
    assert "data: { assignedTo: to }" in apply
    assert "status: 'open'" in apply
    # The Kanban only: conversations keep their attendant, nothing is deleted.
    assert "conversation" not in SERVICE
    assert ".delete" not in SERVICE and "deleteMany" not in SERVICE


def test_every_change_is_logged_and_undoable():
    assert "LEAD_ASSISTANT_BATCH_ACTION = 'lead.assistant_distributed'" in SERVICE
    assert "changes: distribution.changes.map((change) => ({ l: change.leadId, f: change.from, t: change.to }))" in SERVICE
    undo = SERVICE.split("export async function undoLeadBatch", 1)[1]
    # A lead changed again after the batch is left as it is.
    assert "lead.assignedTo === change.t" in undo
    assert "Essa mudança já foi desfeita." in undo


def test_the_ai_sees_no_customer_data():
    interpret = SERVICE.split("async function interpret", 1)[1].split("function resolveNames", 1)[0]
    for field in ["phone", "email", "lead.name", "answers"]:
        assert field not in interpret
    assert "messages: [{ role: 'user', content: command }]" in interpret


def test_commands_live_in_the_flip_bar_with_confirm_and_undo():
    assert "canCommandLeads={can(session.role, 'LEADS_EDIT_ALL')}" in read("app/(app)/flip/page.tsx")
    bar = read("components/flip/ask-flip.tsx")
    assert "<LeadCommandCard command={item.question} preview={item.command} />" in bar
    card = read("components/flip/lead-command-card.tsx")
    assert "'/api/leads/assistant/apply'" in card and "Confirmar" in card
    assert "'/api/leads/assistant/undo'" in card and "Desfazer" in card
    assert "LeadAssistantDialog" not in read("app/(app)/leads/page.tsx")
    assert "tests/lead-assistant-rules.test.ts" in read(".github/workflows/ci.yml")


def test_flip_bar_has_three_requests_a_day_per_person():
    route = read("app/api/flip/ask/route.ts")
    # Checked before any AI call, for questions and commands alike.
    assert route.index("flipRequestsLeftToday(session)") < route.index("looksLikeLeadCommand(question)")
    assert "status: 429" in route
    usage = read("lib/flip/daily-usage.ts")
    assert "userId: session.userId" in usage and "startOfBrasiliaDay(now)" in usage
    assert "FLIP_DAILY_REQUEST_LIMIT = 3" in read("lib/flip/daily-limit.ts")
    # Examples only fill the bar; they do not spend a request.
    assert "onClick={() => setQuestion(example)}" in read("components/flip/ask-flip.tsx")
    assert "tests/flip-daily-limit.test.ts" in read(".github/workflows/ci.yml")
