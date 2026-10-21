from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_sales_are_counted_by_the_final_stage_not_only_by_the_won_status():
    for path in ("lib/flip/ask.ts", "lib/flip/briefing.ts", "lib/costs/operation-costs.ts"):
        text = read(path)
        assert "finalStageIdsForTenant(prisma," in text, path
        assert "status: { not: 'lost' }, stageId: { in: finalStageIds }" in text, path
        assert "status: 'won' }" not in text, path
    assert "closedInPeriod(prisma," in read("app/api/reports/leads-by-form/route.ts")


def test_a_lead_created_in_the_final_stage_is_a_sale():
    route = read("app/api/leads/route.ts")
    assert "const createdAsSale = finalStage?.id === parsed.data.stageId;" in route
    assert "status: createdAsSale ? 'won' : 'open'," in route
