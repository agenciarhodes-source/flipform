"""Leads page: filter by pipeline and, inside it, by stage."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_leads_api_filters_by_stage_inside_the_company():
    route = read("app/api/leads/route.ts")
    assert "const where: any = { tenantId: session.tenantId, ...getLeadScopeForRole(session) };" in route
    assert "if (stageId && /^[A-Za-z0-9_-]{1,128}$/.test(stageId)) where.stageId = stageId;" in route


def test_leads_page_has_pipeline_then_stage_filter():
    page = read("app/(app)/leads/page.tsx")
    assert 'aria-label="Filtrar por pipeline"' in page
    assert 'aria-label="Filtrar por etapa"' in page
    assert "setPipelineFilter(event.target.value); setStageFilter('');" in page
    assert "if (pipelineFilter && stageFilter) params.set('stageId', stageFilter);" in page
    assert "disabled={!pipelineFilter}" in page


def test_leads_page_has_period_filter():
    page = read("app/(app)/leads/page.tsx")
    assert 'aria-label="Filtrar por período de entrada"' in page
    assert '<option value="7d">Últimos 7 dias</option>' in page
    assert '<option value="30d">Últimos 30 dias</option>' in page
    assert '<option value="custom">Personalizado</option>' in page
    assert "params.set('period', 'custom');" in page
    route = read("app/api/leads/route.ts")
    assert "if (!['7d', '30d', 'custom'].includes(period)) {" in route
