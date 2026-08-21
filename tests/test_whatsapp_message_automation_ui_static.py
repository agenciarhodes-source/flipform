from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_whatsapp_automation_client_uses_safe_session_scoped_apis():
    client = read('app/(app)/automations/whatsapp-message-automation-client.tsx')

    assert "fetch('/api/integrations/whatsapp/message-automations'" in client
    assert "fetch('/api/integrations/whatsapp/connection'" in client
    assert "fetch('/api/pipelines'" in client
    assert '/api/integrations/whatsapp/message-automations/${encodeURIComponent' in client
    assert "method: editingRuleId ? 'PATCH' : 'POST'" in client
    assert 'body: JSON.stringify(draft)' in client
    assert 'tenantId' not in client
    assert 'accessToken' not in client
    assert 'appSecret' not in client


def test_whatsapp_automation_client_exposes_keyword_reply_and_crm_steps():
    client = read('app/(app)/automations/whatsapp-message-automation-client.tsx')

    assert 'Mensagens do WhatsApp' in client
    assert 'Palavra-chave ou frase' in client
    assert 'Resposta automática' in client
    assert 'Contém a palavra ou frase' in client
    assert 'Mensagem exata' in client
    assert 'Automação ativa' in client
    assert 'CRM e Kanban (opcional)' in client
    assert 'Criar ou vincular lead no CRM' in client
    assert 'Mover lead no Kanban' in client
    assert 'Etapa inicial' in client
    assert 'Etapa de destino' in client
    assert "rule.enabled ? 'Pausar' : 'Ativar'" in client
    assert 'Nova automação' in client
    assert 'WhatsApp · mensagem → fluxo' in client


def test_whatsapp_crm_builder_keeps_same_pipeline_when_steps_are_combined():
    client = read('app/(app)/automations/whatsapp-message-automation-client.tsx')

    assert 'draft.ensureLead && draft.moveLead && draft.ensureLead.pipelineId !== draft.moveLead.pipelineId' in client
    assert 'a criação e a movimentação do lead precisam usar o mesmo pipeline' in client.lower()
    assert 'disabled={!canEdit || Boolean(draft.ensureLead)}' in client


def test_workspace_opens_whatsapp_configuration_without_new_runtime():
    workspace = read('app/(app)/automations/automation-workspace-client.tsx')

    assert "type WorkspaceView = 'overview' | 'instagram-comment' | 'whatsapp-message'" in workspace
    assert "if (view === 'whatsapp-message')" in workspace
    assert 'WhatsAppMessageAutomationClient canEdit={canEdit}' in workspace
    assert "onClick={() => setView('whatsapp-message')}" in workspace
    assert 'runAutomationWorker' not in workspace
    assert 'processWhatsAppCloudWebhook' not in workspace
