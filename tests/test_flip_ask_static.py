from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_ask_flip_uses_ready_made_queries_scoped_to_who_asks():
    ask = read("lib/flip/ask.ts")
    assert "owner = seesTeam ? (attendant ? { assignedTo: attendant.id } : {}) : { assignedTo: session.userId };" in ask
    assert "Use somente os números do resultado. Não invente nada." in ask
    for forbidden in ("$queryRawUnsafe", "$executeRawUnsafe", ".create({\n      data: { tenantId: session.tenantId, leadId"):
        assert forbidden not in ask
    route = read("app/api/flip/ask/route.ts")
    assert "action: 'flip.question_asked'" in route
    assert "<AskFlip />" in read("components/flip/alerts-board.tsx")
    assert "tests/flip-ask-rules.test.ts" in read(".github/workflows/ci.yml")


def test_flip_page_starts_with_the_search_bar():
    board = read("components/flip/alerts-board.tsx")
    assert board.index("<AskFlip />") < board.index("<h2 className=\"text-lg font-semibold\">Pendências</h2>")
    ask = read("components/flip/ask-flip.tsx")
    assert 'placeholder="Pergunte ao Flip: quantos leads tivemos este mês?"' in ask
    assert "'Como está o time de atendimento?'" in ask


def test_flip_answers_team_channels_and_comparison_for_managers_only():
    ask = read("lib/flip/ask.ts")
    for query in ["case 'team_service': {", "case 'channels': {", "case 'compare': {"]:
        assert query in ask
    assert "if (!seesTeam) return { filters: filtersUsed, data: { aviso: 'O retrato do time é da empresa toda; só gestores podem ver.' } };" in ask
    assert "attendanceProductivity(session.tenantId, { days, now, onlyUserId: attendant?.id || null })" in ask
    rules = read("lib/flip/ask-rules.ts")
    assert "'team_service', 'channels', 'compare', 'unsupported'," in rules
