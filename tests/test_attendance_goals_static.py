from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_weekly_goals_follow_the_report_scope():
    route = read("app/api/reports/attendance-productivity/route.ts")
    assert "weeklyGoals(session.tenantId, { onlyUserId })" in route
    lib = read("lib/reports/attendance-productivity.ts")
    assert "suggestedGoal(full.map((week) => week.initiated))" in lib
    assert "input.onlyUserId && userId !== input.onlyUserId" in lib


def test_weekly_goals_need_no_database_change():
    assert "attendantGoal" not in read("lib/reports/attendance-productivity.ts")
    assert "attendant_goals" not in read("prisma/schema.prisma")


def test_board_shows_weekly_goals_and_initiated_columns():
    board = read("components/reports/attendance-productivity-board.tsx")
    assert "Metas semanais" in board
    assert "Conversas iniciadas" in board
    assert ">Iniciadas</th>" in board
    assert ">Retorno</th>" in board
