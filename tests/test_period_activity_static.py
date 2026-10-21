from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_sales_count_on_the_day_they_closed_everywhere():
    activity = read("lib/period-activity.ts")
    assert "{ OR: [{ stageId: { in: input.finalStageIds } }, { status: 'won' }] }," in activity
    assert "createdAt: { gte: input.start, lte: input.end }" in activity
    for route in ("app/api/reports/summary/route.ts", "app/api/reports/agent-performance/route.ts"):
        text = read(route)
        assert "const { enteredAt: _arrival, ...scope } = ctx.leadsWhere;" in text
        assert "closedInPeriod(prisma," in text
    stage = read("app/api/reports/leads-by-stage/route.ts")
    assert "stageEntriesInPeriod(prisma," in stage
    metrics = read("lib/dashboard-metrics.ts")
    assert "openDeals: { current: openDealsCurrent, previous: null, delta: null, deltaPercent: null }," in metrics
