from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def test_notification_center_uses_read_only_polling_and_local_browser_state():
    center = read('components/lead-notification-center.tsx')
    assert "const POLL_MS = 15_000" in center
    assert "/api/notifications/leads" in center
    assert "cache: 'no-store'" in center
    assert "window.setInterval" in center
    assert "window.localStorage" in center
    assert "Notifications are best-effort and must never affect CRM flows." in center
    assert "Notificações de leads" in center
    assert "Novos leads da sua operação" in center
    assert "Marcar como vistas" in center
    for forbidden in ['POST', 'PUT', 'PATCH', 'DELETE']:
        assert f"method: '{forbidden}'" not in center

def test_notification_center_is_mounted_in_shell_without_touching_group_view():
    shell = read('components/app-shell.tsx')
    assert 'LeadNotificationCenter' in shell
    assert '!inGroupView && <LeadNotificationCenter tenantId={session.tenantId} userId={session.userId} />' in shell
    for forbidden in [
        'TenantMetaConnection',
        'PlatformMetaSettings',
        'TenantIntegrationSettings',
        'TenantWhatsAppConnection',
        'TenantInstagramConnection',
        'dispatchFormSubmissionTracking',
    ]:
        assert forbidden not in shell

def test_notification_items_are_stored_locally_and_bounded():
    state = read('lib/notifications/browser-state.ts')
    assert 'flipform:lead-notification-items:' in state
    assert 'parseStoredNotificationItems' in state
    assert 'mergeStoredNotificationItems' in state
    assert 'slice(-50)' in state

def test_notification_click_can_open_lead_detail_without_mutating_lead():
    page = read('app/(app)/leads/page.tsx')
    assert 'useSearchParams' in page
    assert "searchParams.get('leadId')" in page
    assert 'setSelectedId(leadId)' in page
    assert '<LeadDetailModal leadId={selectedId}' in page

def test_notification_ui_changes_do_not_touch_integration_or_lead_creation_paths():
    paths = [
        'components/lead-notification-center.tsx',
        'components/app-shell.tsx',
        'lib/notifications/browser-state.ts',
        'app/(app)/leads/page.tsx',
    ]
    combined = '\n'.join(read(path) for path in paths)
    for forbidden in [
        'prisma.lead.create',
        'prisma.lead.update',
        'prisma.lead.delete',
        'metaAccessToken',
        'TenantMetaConnection',
        'TenantWhatsAppConnection',
        'TenantInstagramConnection',
        'dispatchFormSubmissionTracking',
        'dispatchKanbanStageTracking',
        'dispatchLeadPurchaseTracking',
    ]:
        assert forbidden not in combined
