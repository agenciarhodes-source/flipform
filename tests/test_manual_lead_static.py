from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_manual_lead_sources_and_labels():
    helper = read('lib/leads.ts')
    for value in ['referral', 'own_prospecting', 'google', 'facebook', 'instagram', 'visit', 'call_center']:
        assert value in helper
    for label in ['Indicação', 'Captação própria', 'Google', 'Facebook', 'Instagram', 'Visita', 'Call center', 'Formulário']:
        assert label in helper


def test_manual_lead_api_validates_tenant_pipeline_stage_and_form_null():
    route = read('app/api/leads/route.ts')
    assert "withPermission('LEADS_CREATE'" in route
    assert 'tenantId: session.tenantId' in route
    assert 'formId: null' in route
    assert "source: parsed.data.source" in route
    assert "status: 'open'" in route
    assert "pipeline: { tenantId: session.tenantId }" in route
    assert "Etapa inválida para o pipeline selecionado." in route
    assert "Já existe um lead com este contato." in route
    assert 'forceCreate' in route


def test_manual_lead_ui_in_leads_and_kanban():
    dialog = read('components/manual-lead-dialog.tsx')
    leads = read('app/(app)/leads/page.tsx')
    kanban = read('app/(app)/kanban/page.tsx')
    assert 'Adicionar lead manualmente' in dialog
    assert 'Origem do lead *' in dialog
    assert '+55 (00) 9 0000-0000' in dialog
    assert 'Criar mesmo assim' in dialog
    assert 'Novo lead' in leads
    assert 'ManualLeadDialog' in leads
    assert 'formatLeadSource(l.source)' in leads
    assert 'Novo lead' in kanban
    assert 'ManualLeadDialog' in kanban
    assert 'formatLeadSource(lead.source)' in kanban


def test_manual_lead_dashboard_and_reports_format_sources():
    assert 'formatLeadSource(row.source)' in read('lib/dashboard-metrics.ts')
    assert 'formatLeadSource(g.source)' in read('app/api/reports/leads-by-source/route.ts')
