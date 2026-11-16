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


def test_names_stay_inside_the_system_and_lessons_need_approval():
    lib = read("lib/reports/attendance-diagnosis.ts")
    assert "people: people.map((person) => person.name)," in lib
    # The AI only sees "Pessoa N"; the names are put back when the diagnosis is read.
    assert "## Pessoa ${index + 1}" in lib
    learning = read("lib/flip/learning.ts")
    assert "messages: [{ role: 'user', content: diagnosis.labeledText.slice(0, 8_000) }]" in learning
    assert "origin: 'diagnosis'" in learning
    assert "const done = await prisma.flipAiUsageEvent.findFirst({ where: { requestKey }" in learning
    route = read("app/api/reports/attendance-diagnosis/learning/route.ts")
    assert "export const POST = withPermission('FLIP_AI_MANAGE'" in route
    assert "export const POST = withPermission('FLIP_AI_MANAGE'" in read("app/api/flip/learning/approve-all/route.ts")
    board = read("components/reports/attendance-diagnosis-board.tsx")
    assert "'/api/reports/attendance-diagnosis/learning'" in board
    assert 'href="/whatsapp-ai/learning"' in board
