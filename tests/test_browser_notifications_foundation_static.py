from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def test_lead_notification_feed_is_read_only_and_tenant_scoped():
    route = read('app/api/notifications/leads/route.ts')
    assert "withPermission('LEADS_VIEW'" in route
    assert 'tenantId: session.tenantId' in route
    assert 'getLeadScopeForRole(session)' in route
    assert 'prisma.lead.findMany' in route
    assert "type: 'lead_created'" in route
    assert 'readOnly: true' in route
    for forbidden in [
        'prisma.lead.create',
        'prisma.lead.update',
        'prisma.lead.delete',
        'prisma.tenantMetaConnection',
        'prisma.platformMetaSettings',
        'prisma.tenantIntegrationSettings',
        'prisma.tenantWhatsAppConnection',
        'prisma.tenantInstagramConnection',
        'dispatchFormSubmissionTracking',
        'dispatchKanbanStageTracking',
        'dispatchLeadPurchaseTracking',
    ]:
        assert forbidden not in route

def test_notification_feed_first_call_establishes_baseline_without_replaying_history():
    route = read('app/api/notifications/leads/route.ts')
    assert "if (!afterRaw)" in route
    assert "items: []" in route
    assert "cursor: { createdAt: new Date().toISOString(), id: null }" in route
    assert "createdAt: { gt: after }" in route
    assert "orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]" in route
    assert 'take: MAX_ITEMS' in route

def test_notification_browser_state_is_local_only_and_bounded():
    source = read('lib/notifications/browser-state.ts')
    assert 'flipform:lead-notification-cursor:' in source
    assert 'flipform:lead-notification-seen:' in source
    assert 'parseStoredCursor' in source
    assert 'parseSeenNotificationIds' in source
    assert 'mergeSeenNotificationIds' in source
    assert 'slice(-200)' in source

def test_notification_foundation_does_not_change_schema_or_integrations():
    route = read('app/api/notifications/leads/route.ts')
    state = read('lib/notifications/browser-state.ts')
    combined = route + state
    assert 'ALTER TABLE' not in combined
    assert 'CREATE TABLE' not in combined
    assert 'metaAccessToken' not in combined
    assert 'TenantMetaConnection' not in combined
    assert 'PlatformMetaSettings' not in combined
    assert 'TenantIntegrationSettings' not in combined
    assert 'TenantWhatsAppConnection' not in combined
    assert 'TenantInstagramConnection' not in combined
    assert 'dispatchFormSubmissionTracking' not in combined
    assert 'dispatchKanbanStageTracking' not in combined
    assert 'dispatchLeadPurchaseTracking' not in combined
