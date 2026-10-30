from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_diagnosis_reads_human_conversations_without_customer_data_and_charges_credits():
    lib = read("lib/reports/attendance-diagnosis.ts")
    assert "channel: { in: ['whatsapp', 'instagram'] }, direction: 'outbound'," in lib
    assert "sentByUserId: person.userId" in lib
    assert "Não cite nomes de clientes nem dados pessoais." in lib
    assert "Sem listas, sem tópicos" in lib
    assert "await settleFlipAiUsageCharge({ tenantId, eventId: event.id })" in lib
    assert "throw new AttendanceDiagnosisError('recent');" in lib


def test_only_managers_see_and_only_owners_or_admins_generate():
    route = read("app/api/reports/attendance-diagnosis/route.ts")
    assert "export const GET = withPermission('REPORTS_VIEW_ALL'" in route
    assert "export const POST = withPermission('FLIP_AI_MANAGE'" in route
    assert "if (!can(session.role, 'REPORTS_VIEW_ALL')) redirect('/dashboard');" in read("app/(app)/reports/diagnosis/page.tsx")
    assert "if (!can(session.role, 'REPORTS_VIEW_ALL')) redirect('/reports');" in read("app/report/attendance-diagnosis/page.tsx")


def test_diagnosis_page_has_pdf_and_is_linked():
    board = read("components/reports/attendance-diagnosis-board.tsx")
    assert 'href="/report/attendance-diagnosis"' in board
    assert "Baixar PDF" in board
    assert 'href="/reports/diagnosis"' in read("components/flip/alerts-board.tsx")
    assert 'href="/reports/diagnosis"' in read("components/reports-page-client.tsx")
