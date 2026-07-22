import re
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


def test_dashboard_lead_selects_include_commercial_entry_and_system_creation_dates():
    metrics = (ROOT / "lib/dashboard-metrics.ts").read_text()
    lead_selects = re.findall(r"db\.lead\.findMany\(\{\n      where: (?:currentWhere|previousWhere),(.*?)\n    \}\)", metrics, re.DOTALL)
    assert len(lead_selects) == 2
    for select in lead_selects:
        assert "enteredAt: true" in select
        assert "createdAt: true" in select
    assert "orderBy: [{ enteredAt: 'asc' }, { createdAt: 'asc' }]" in lead_selects[0]


def test_dashboard_metrics_include_dynamic_funnel_projection_and_profiles():
    metrics = (ROOT / "lib/dashboard-metrics.ts").read_text()
    assert "pipelineStage.findMany" in metrics
    assert "orderBy: { orderIndex: 'asc' }" in metrics
    assert "dropOffRate" in metrics
    assert "Math.max(0, percent(previousCount - count, previousCount))" in metrics
    assert "advanceRate = index === 0 ? 100 : previousCount > 0" in metrics
    assert "projectionTotal" in metrics
    assert "isClosedLead(lead, finalStagesByPipeline)" in metrics
    assert "extractLeadLocation" in metrics
    assert "BRAZIL_STATES" in metrics
    assert "formsPerformance" in metrics


def test_dashboard_ui_has_filters_charts_empty_and_error_states():
    page = (ROOT / "app/(app)/dashboard/page.tsx").read_text()
    assert "Período" in page
    assert "Pipeline" in page
    assert "Formulário" in page
    assert "Estado" in page
    assert "Cidade" in page
    assert "Leads por dia" in page
    assert "Perfil do funil" in page
    assert "Mapa de leads" in page
    assert "Selecione um pipeline para visualizar as etapas do funil." in page
    assert "Não foi possível carregar o dashboard." in page
    assert "Tentar novamente" in page
    assert "Ainda não há leads suficientes para gerar métricas." in page


def test_dashboard_geo_and_final_stage_rules_are_present():
    metrics = (ROOT / "lib/dashboard-metrics.ts").read_text()
    assert "state: z.string().trim()" in metrics
    assert "city: z.string().trim()" in metrics
    assert "selectedState" in metrics
    assert "byState" in metrics
    assert "byCity" in metrics
    assert "Qualificados" or "qualified" in metrics
    assert "finalStagesByPipeline.get(lead.pipelineId)" in metrics
    assert "lead.status === ('won' as LeadStatus)" in metrics


def test_dashboard_executive_metrics_helpers_and_payload_are_present():
    metrics = (ROOT / "lib/dashboard-metrics.ts").read_text()
    assert "getExecutiveMetrics" in metrics
    assert "activityPulse" in metrics
    assert "calculateRevenue" in metrics
    assert "hasRevenueSource: true" in metrics
    assert "saleValueCents" in metrics
    assert "leadStageHistory.findMany" in metrics
    assert "calculateOpenDeals" in metrics
    assert "status: { not: 'lost' as LeadStatus }" in metrics
    assert "calculateAverageTimeToClose" in metrics
    assert "leadStageHistory.findMany" in metrics
    assert "calculateConversionRate" in metrics
    assert "deltaPoints" in metrics
    assert "previousWindow(params.period.startDate" in metrics
    assert "getActivityPulseLast24h" in metrics
    assert "Array.from({ length: 48 }" in metrics
    assert "tenantId, pipelineId" in metrics


def test_dashboard_ui_has_executive_top_and_activity_pulse():
    page = (ROOT / "app/(app)/dashboard/page.tsx").read_text()
    assert "TeamActivityPulse" in page
    assert "Pulso do dia — atividade da equipe nas últimas 24h" in page
    assert "Ao vivo" in page
    assert "Receita do período" in page
    assert "moneyFromCents" in page
    assert "Negócios abertos" in page
    assert "Tempo médio até fechamento" in page
    assert "Taxa de conversão" in page
    assert "vs. período anterior" in page


def test_dashboard_counts_final_stage_by_pipeline_for_all_pipelines():
    metrics = (ROOT / "lib/dashboard-metrics.ts").read_text()
    assert "getPipelineStageMetrics(db, tenantId, pipelineId)" in metrics
    assert "initialStagesByPipeline" in metrics
    assert "finalStagesByPipeline" in metrics
    assert "stageOrderByPipeline" in metrics
    assert "const finalStageCount = filteredLeads.filter((lead) => isClosedLead(lead, finalStagesByPipeline)).length" in metrics
    assert "lead.status !== ('lost' as LeadStatus) && lead.stageId !== initial && lead.stageId !== final" in metrics
    assert "formsPerformance" in metrics and "counts.final" in metrics


def test_kanban_move_marks_final_stage_as_won_and_hot():
    route = (ROOT / "app/api/leads/[id]/move/route.ts").read_text()
    assert "orderBy: { orderIndex: 'desc' }" in route
    assert "isMovingToFinalStage" in route
    assert "newStatus = 'won'" in route
    assert "newTemperature = 'hot'" in route
    assert "Lead marcado como ganho ao chegar na etapa final." in route
