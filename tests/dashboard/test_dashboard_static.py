from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_dashboard_api_uses_aggregated_metrics_and_tenant_session_scope():
    route = (ROOT / "app/api/dashboard/route.ts").read_text()
    metrics = (ROOT / "lib/dashboard-metrics.ts").read_text()
    assert "withPermission('DASHBOARD_VIEW'" in route
    assert "session.tenantId" in route
    assert "dashboardQuerySchema.safeParse" in route
    assert "tenantId: params.tenantId" in metrics
    assert "Object.fromEntries(searchParams.entries())" in route


def test_dashboard_metrics_include_dynamic_funnel_projection_and_profiles():
    metrics = (ROOT / "lib/dashboard-metrics.ts").read_text()
    assert "pipelineStage.findMany" in metrics
    assert "orderBy: { orderIndex: 'asc' }" in metrics
    assert "dropOffRate" in metrics
    assert "projectionTotal" in metrics
    assert "temperature" in metrics
    assert "formsPerformance" in metrics


def test_dashboard_ui_has_filters_charts_empty_and_error_states():
    page = (ROOT / "app/(app)/dashboard/page.tsx").read_text()
    assert "Período" in page
    assert "Pipeline" in page
    assert "Formulário" in page
    assert "Leads gerados no período" in page
    assert "Perfil dos leads" in page
    assert "Selecione um pipeline para visualizar as etapas do funil." in page
    assert "Não foi possível carregar o Dashboard. Tente novamente." in page
    assert "Ainda não há leads suficientes para gerar métricas." in page
