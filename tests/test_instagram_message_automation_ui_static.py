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
    assert 'O módulo é opcional' in client
    assert 'Não inicia conversas não solicitadas' in client
    assert 'não cria, edita ou move Leads' in client
    assert 'Meta Ads, Pixel, Dataset ou CAPI' in client
