from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_daily_briefing_is_made_once_a_day_on_first_open_and_never_invents():
    briefing = read("lib/flip/briefing.ts")
    assert "if (existing) return existing;" in briefing
    assert "if (hour < BRIEFING_FROM_HOUR) return null;" in briefing
    assert "text: aiText || plainBriefing(facts)," in briefing
    rules = read("lib/flip/briefing-rules.ts")
    assert "Não invente dados, nomes nem porcentagens." in rules
    assert "<DailyBriefingPopup />" in read("components/app-shell.tsx")
    assert "<DailyBriefingCard />" in read("components/flip/alerts-board.tsx")
    migration = read("prisma/migrations/20261022150000_flip_daily_briefings/migration.sql")
    assert "DROP" not in migration
    assert "tests/flip-briefing-rules.test.ts" in read(".github/workflows/ci.yml")
