from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_kanban_filters_by_arrival_by_movement_or_every_open_lead():
    page = read("app/(app)/kanban/page.tsx")
    assert "useState<'moved' | 'entered' | 'open'>('moved')" in page
    assert '<SelectItem value="moved">Movimentados no período</SelectItem>' in page
    assert "params.set('basis', basis);" in page
    route = read("app/api/leads/route.ts")
    assert "['entered', 'moved', 'open'].includes(basis)" in route
    assert "where: { createdAt: { gte: range.gte, lte: range.lte }, lead: scope }," in route
    assert "inRange(lead.enteredAt) || pairs.has(`${lead.id}:${lead.stageId}`)" in route
