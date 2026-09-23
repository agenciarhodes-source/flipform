from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_group_read_scope_is_membership_and_billing_authoritative():
    helper = read('lib/business-group-read-scope.ts')
    assert 'getBusinessGroupAccessesForUser(prisma, input.userId)' in helper
    assert 'evaluateBillingAccess' in helper
    assert 'state.accesses.find' in helper
    assert 'group.tenants' in helper
    assert 'tenantOptions.filter((tenant) => tenant.accessAllowed)' in helper
    assert 'Esta empresa não pertence ao seu grupo empresarial.' in helper
    assert 'BUSINESS_GROUP_TENANT_BLOCKED' in helper


def test_group_leads_api_is_read_only_and_labels_company_and_assignee():
    route = read('app/api/business-groups/leads/route.ts')
    assert 'getSessionFromRequest(req)' in route
    assert 'resolveBusinessGroupReadScope' in route
    assert 'tenantId: { in: scope.tenantIds }' in route
    assert 'prisma.lead.findMany' in route
    assert 'assignedUser:' in route
    assert 'company:' in route
    assert 'prisma.tenantUser.findMany' in route
    for forbidden in [
        'prisma.lead.create', 'prisma.lead.update', 'prisma.lead.delete',
        'prisma.form.create', 'prisma.form.update', 'prisma.pipeline.update',
        'prisma.integration', 'metaAccessToken', 'whatsapp',
    ]:
        assert forbidden not in route


def test_group_forms_api_is_read_only_and_tenant_scoped():
    route = read('app/api/business-groups/forms/route.ts')
    assert 'getSessionFromRequest(req)' in route
    assert 'resolveBusinessGroupReadScope' in route
    assert 'tenantId: { in: scope.tenantIds }' in route
    assert 'prisma.form.findMany' in route
    assert '_count: { select: { leads: true, fields: true } }' in route
    assert 'company:' in route
    for forbidden in ['prisma.form.create', 'prisma.form.update', 'prisma.form.delete', 'prisma.lead.update', 'prisma.pipeline.update']:
        assert forbidden not in route


def test_group_workspace_pages_and_navigation_exist():
    shell = read('components/app-shell.tsx')
    leads_page = read('app/(app)/group/leads/page.tsx')
    forms_page = read('app/(app)/group/forms/page.tsx')
    reports_page = read('app/(app)/group/reports/page.tsx')
    assert 'href: "/group"' in shell
    assert 'href: "/group/leads"' in shell
    assert 'href: "/group/forms"' in shell
    assert 'href: "/group/reports"' in shell
    assert 'BusinessGroupLeadsClient' in leads_page
    assert 'BusinessGroupFormsClient' in forms_page
    assert 'BusinessGroupReportsClient' in reports_page
    for page in [leads_page, forms_page, reports_page]:
        assert 'getBusinessGroupAccessesForUser(prisma, session.userId)' in page


def test_group_lead_ui_shows_company_and_attendant_tags():
    client = read('components/business-group-leads-client.tsx')
    assert 'Leads do grupo' in client
    assert 'Toda a operação' in client
    assert 'Atendente' in client
    assert 'lead.company?.name' in client
    assert "lead.assignedUser?.name || 'Sem atendente'" in client
    assert 'Abrir empresa' in client
    assert "router.push('/leads')" in client


def test_group_forms_ui_is_read_only_and_can_open_tenant_management():
    client = read('components/business-group-forms-client.tsx')
    assert 'Formulários do grupo' in client
    assert 'somente leitura' in client
    assert 'form.company?.name' in client
    assert 'form._count.leads' in client
    assert "router.push('/forms')" in client


def test_group_reports_support_generate_and_browser_print_without_export_dependency():
    client = read('components/business-group-reports-client.tsx')
    assert 'Relatórios do grupo' in client
    assert 'Gerar relatório' in client
    assert 'Imprimir / Salvar PDF' in client
    assert 'window.print()' in client
    assert 'Toda a operação' in client
    assert 'Resultado por empresa' in client
    assert 'html2pdf' not in client.lower()
    assert 'jspdf' not in client.lower()


def test_group_dashboard_can_filter_group_or_company_and_shows_full_result_set():
    client = read('components/business-group-overview-client.tsx')
    assert 'Dashboard do grupo' in client
    assert 'Toda a operação' in client
    for label in ['Novos leads', 'Em andamento', 'Fechados', 'Perdidos', 'Compras', 'Clientes', 'Conversão', 'Receita']:
        assert label in client
    assert 'Personalizado' in client
    assert 'Data inicial' in client
    assert 'Data final' in client
    assert 'overview.funnelStages.map' in client
    assert '2xl:grid-cols-8' in client
    assert 'performanceRows' in client


def test_group_dashboard_api_supports_custom_dates_purchase_customer_split_and_dynamic_stages():
    route = read('app/api/business-groups/overview/route.ts')
    assert "z.enum(['today', '7d', '30d', 'custom'])" in route
    assert "startDate" in route and "endDate" in route
    assert "periodWindow(parsed.data.period, parsed.data.startDate, parsed.data.endDate)" in route
    assert "leadId: true" in route
    assert "buyingCustomers = new Set" in route
    assert "tenantBuyingCustomers" in route
    assert "funnelStages" in route
    assert "stage.name.trim().toLocaleLowerCase('pt-BR')" in route
    assert "percentage: percent(stage.count, leads.length)" in route


def test_group_dashboard_supports_personalized_metrics_and_printable_company_view():
    client = read('components/business-group-overview-client.tsx')
    assert 'DashboardMetricPicker' in client
    assert 'DEFAULT_GROUP_METRICS' in client
    assert 'flipform-group-dashboard-metrics-v1' in client
    assert 'Métricas da visão atual' in client
    assert 'Até 8 blocos personalizados' in client
    assert 'Imprimir / Salvar PDF' in client
    assert 'window.print()' in client
    assert "key: `stage:${stage.key}`" in client
