from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_automations_page_routes_through_channel_neutral_workspace():
    page = read('app/(app)/automations/page.tsx')
    workspace = read('app/(app)/automations/automation-workspace-client.tsx')

    assert 'AutomationWorkspaceClient' in page
    assert "can(session.role, 'INTEGRATIONS_VIEW')" in page
    assert "can(session.role, 'INTEGRATIONS_EDIT')" in page
    assert 'Automation Builder' in workspace
    assert 'InstagramCommentAutomationClient' in workspace
    assert 'Comentário do Instagram → Direct' in workspace
    assert 'WhatsApp' in workspace
    assert 'Fluxos multietapas' in workspace


def test_workspace_is_ui_only_and_preserves_existing_runtime_authority():
    workspace = read('app/(app)/automations/automation-workspace-client.tsx')

    assert "fetch(" not in workspace
    assert '/api/' not in workspace
    assert 'tenantId' not in workspace
    assert 'accessToken' not in workspace
    assert 'appSecret' not in workspace
    assert 'InstagramCommentAutomationClient canEdit={canEdit}' in workspace


def test_workspace_does_not_touch_crm_or_create_parallel_runtime():
    workspace = read('app/(app)/automations/automation-workspace-client.tsx').lower()

    for forbidden in (
        'prisma.',
        'webhookevent',
        'enqueueautomationexecution',
        'drainautomationexecutionqueue',
        'create lead',
        'update lead',
    ):
        assert forbidden not in workspace
