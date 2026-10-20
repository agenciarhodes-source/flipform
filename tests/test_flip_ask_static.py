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
