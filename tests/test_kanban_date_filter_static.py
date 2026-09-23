from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def test_kanban_ui_has_7d_30d_and_custom_date_filter():
    page = read('app/(app)/kanban/page.tsx')
    assert "useState<'7d' | '30d' | 'custom'>('30d')" in page
    assert 'Período do Kanban' in page
    assert '<SelectItem value="7d">7 dias</SelectItem>' in page
    assert '<SelectItem value="30d">30 dias</SelectItem>' in page
    assert '<SelectItem value="custom">Personalizado</SelectItem>' in page
    assert 'Data inicial do Kanban' in page
    assert 'Data final do Kanban' in page
    assert "new URLSearchParams({ pipelineId, period })" in page
    assert "params.set('startDate', startDate)" in page
    assert "params.set('endDate', endDate)" in page
    assert 'Filtro por data de entrada do lead no funil' in page

def test_leads_api_filters_kanban_by_entered_at_and_validates_custom_range():
    route = read('app/api/leads/route.ts')
    assert "['7d', '30d', 'custom'].includes(period)" in route
    assert 'isValidDateOnly(startDate)' in route
    assert 'isValidDateOnly(endDate)' in route
    assert 'startDate > endDate' in route
    assert "rangeStart = subtractCalendarDays(rangeEnd, period === '7d' ? 6 : 29)" in route
    assert 'where.enteredAt = { gte: dateOnlyBoundary(rangeStart), lte: dateOnlyBoundary(rangeEnd, true) }' in route
    assert 'tenantId: session.tenantId' in route
    assert 'getLeadScopeForRole(session)' in route

def test_leads_api_remains_backward_compatible_without_period():
    route = read('app/api/leads/route.ts')
    assert 'if (period) {' in route
    assert 'if (pipelineId) where.pipelineId = pipelineId;' in route
