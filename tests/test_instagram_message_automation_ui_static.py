from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_automation_workspace_exposes_instagram_direct_flow():
    workspace = read('app/(app)/automations/automation-workspace-client.tsx')
    client = read('app/(app)/automations/instagram-message-automation-client.tsx')

    assert "import { InstagramMessageAutomationClient }" in workspace
    assert "'instagram-message'" in workspace
    assert 'Direct do Instagram → Resposta' in workspace
    assert '<InstagramMessageAutomationClient canEdit={canEdit} />' in workspace

    assert '/api/integrations/instagram/message-automations' in client
    assert "fetch('/api/pipelines'" in client
    assert 'O módulo é opcional' in client
    assert 'Não inicia conversas não solicitadas' in client
    assert 'CRM e Kanban (opcional)' in client
    assert 'Criar ou vincular Lead no CRM' in client
    assert 'Mover Lead no Kanban' in client
    assert 'Etapa inicial' in client
    assert 'Etapa de destino' in client
    assert 'As ações de CRM são opt-in' in client
    assert 'Meta Ads, Pixel, Dataset, CAPI, campanhas ou vínculos de integração' in client


def test_instagram_direct_crm_builder_keeps_combined_steps_in_same_pipeline():
    client = read('app/(app)/automations/instagram-message-automation-client.tsx')

    assert 'draft.ensureLead && draft.moveLead && draft.ensureLead.pipelineId !== draft.moveLead.pipelineId' in client
    assert 'a criação e a movimentação do lead precisam usar o mesmo pipeline' in client.lower()
    assert 'disabled={!canEdit || saving || Boolean(draft.ensureLead)}' in client


def test_instagram_direct_ui_does_not_embed_tenant_or_meta_credentials():
    client = read('app/(app)/automations/instagram-message-automation-client.tsx').lower()

    for forbidden in (
        'tenantid',
        'accesstoken',
        'appsecret',
        'graph.facebook.com',
        'tenantmetaconnection',
    ):
        assert forbidden not in client
