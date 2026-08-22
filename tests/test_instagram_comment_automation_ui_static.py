from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_automations_page_is_tenant_session_and_rbac_scoped_with_instagram_parked():
    page = read('app/(app)/automations/page.tsx')
    workspace = read('app/(app)/automations/automation-workspace-client.tsx')

    assert 'getSession()' in page
    assert "can(session.role, 'INTEGRATIONS_VIEW')" in page
    assert "can(session.role, 'INTEGRATIONS_EDIT')" in page
    assert 'AutomationWorkspaceClient' in page
    assert 'InstagramCommentAutomationClient' not in workspace
    assert 'WhatsAppMessageAutomationClient' in workspace
    assert 'Instagram' not in workspace


def test_comment_automation_ui_uses_existing_tenant_safe_endpoints_only():
    client = read('app/(app)/automations/instagram-comment-automation-client.tsx')

    assert "fetch('/api/integrations/instagram/comment-automations'" in client
    assert "fetch('/api/integrations/instagram/connection'" in client
    assert "method: editingRuleId ? 'PATCH' : 'POST'" in client
    assert "method: 'PATCH'" in client
    assert '/api/integrations/instagram/comment-automations/${encodeURIComponent' in client
    assert 'tenantId' not in client
    assert "method: 'DELETE'" not in client


def test_comment_automation_ui_preserves_required_full_patch_contract():
    client = read('app/(app)/automations/instagram-comment-automation-client.tsx')

    for field in ('name:', 'keyword:', 'matchType:', 'replyText:', 'enabled:', 'orderIndex:'):
        assert field in client
    assert 'payloadFromRule(rule, { enabled: !rule.enabled })' in client
    assert 'JSON.stringify(draft)' in client


def test_rule_loading_is_independent_from_connection_health_loading():
    client = read('app/(app)/automations/instagram-comment-automation-client.tsx')

    assert 'Promise.allSettled' in client
    assert "if (rulesResult.status === 'fulfilled')" in client
    assert "if (connectionResult.status === 'fulfilled')" in client
    assert 'setRules(Array.isArray(payload.rules) ? payload.rules : [])' in client
    assert 'setConnectionError' in client
    assert 'rulesError ? (' in client


def test_generated_priority_stays_inside_backend_range():
    client = read('app/(app)/automations/instagram-comment-automation-client.tsx')

    assert 'Math.min(10000, Math.max(0, highestOrder + 10))' in client
    assert 'max={10000}' in client


def test_dormant_comment_automation_ui_keeps_connection_health_and_reconnect_path():
    client = read('app/(app)/automations/instagram-comment-automation-client.tsx')

    assert "health?.state === 'expired'" in client
    assert "health?.state === 'revoked'" in client
    assert "health?.state === 'action_required'" in client
    assert 'href="/integrations"' in client
    assert 'Conectar ou reconectar' in client


def test_automations_are_discoverable_from_main_navigation_for_whatsapp():
    shell = read('components/app-shell.tsx')

    assert '{ href: "/automations", label: "Automações", icon: Zap, permission: "INTEGRATIONS_VIEW" }' in shell


def test_ui_milestone_does_not_mutate_crm_or_add_destructive_rule_actions():
    paths = [
        'app/(app)/automations/page.tsx',
        'app/(app)/automations/automation-workspace-client.tsx',
        'app/(app)/automations/instagram-comment-automation-client.tsx',
        'components/app-shell.tsx',
    ]
    combined = '\n'.join(read(path) for path in paths)

    assert '/api/leads' not in combined
    assert '/api/kanban' not in combined
    assert '/api/conversations' not in combined
    assert 'prisma.' not in combined
    assert "method: 'DELETE'" not in combined
