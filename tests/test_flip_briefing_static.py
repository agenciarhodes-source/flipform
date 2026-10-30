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


def test_owner_can_switch_the_summary_off_for_the_whole_company():
    route = read("app/api/flip/briefing/route.ts")
    assert "if (session.role !== 'owner') {" in route
    assert "if (!(await isBriefingEnabledForCompany(session.tenantId))) return null;" in read("lib/flip/briefing.ts")
    migration = read("prisma/migrations/20261022180000_tenant_flip_briefing_switch/migration.sql")
    assert "DEFAULT true" in migration and "DROP" not in migration
    assert "Desligar o resumo para a empresa toda" in read("components/flip/daily-briefing.tsx")


def test_briefing_is_fuller_and_keeps_the_scope_of_who_reads():
    briefing = read("lib/flip/briefing.ts")
    assert "seesTeam\n      ? prisma.message.findMany(" in briefing.replace("\r\n", "\n")
    assert "maxOutputTokens: 800" in briefing
    assert "createdAt: { gte: lastMonthStart, lt: lastMonthEnd }" in briefing
    rules = read("lib/flip/briefing-rules.ts")
    assert "escreva 2 ou 3 parágrafos curtos" in rules
    assert "Não invente dados, nomes nem porcentagens." in rules
