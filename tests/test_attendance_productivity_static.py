from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_productivity_report_is_scoped_to_the_company_and_the_person():
    route = read("app/api/reports/attendance-productivity/route.ts")
    assert "withPermission('REPORTS_VIEW'" in route
    assert "can(session.role, 'REPORTS_VIEW_ALL') ? null : session.userId" in route
    assert "withPermission('FLIP_AI_MANAGE'" in route
    lib = read("lib/reports/attendance-productivity.ts")
    assert "tenantId, channel: 'whatsapp'" in lib
    # No new table: the evaluation stays with the usage record that paid for it.
    assert "operation: REVIEW_OPERATION" in lib
    assert "settleFlipAiUsageCharge" in lib
    assert "anonymizeText(" in lib


def test_reports_page_links_to_the_productivity_report():
    assert 'href="/reports/attendance"' in read("components/reports-page-client.tsx")
    assert "AttendanceProductivityBoard" in read("app/(app)/reports/attendance/page.tsx")


def test_inbox_shows_ai_only_where_the_ai_answers_the_contact():
    route = read("app/api/inbox/conversations/route.ts")
    assert "aiActive: conversation.channel === 'whatsapp' && aiAnswers(conversation.externalContactIdentity.externalUserId)" in route
    pause = read("lib/whatsapp-ai/pause.ts")
    assert "export async function whatsAppAiAudience(" in pause
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "conversation.aiActive !== false" in inbox
    assert "👤 Atendimento humano" in inbox
