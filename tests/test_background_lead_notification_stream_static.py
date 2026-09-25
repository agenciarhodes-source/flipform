from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def test_background_notification_stream_is_server_driven_and_read_only():
    route = read('app/api/notifications/leads/stream/route.ts')
    assert "export const runtime = 'nodejs'" in route
    assert 'export const maxDuration = 60' in route
    assert "withPermission('LEADS_VIEW'" in route
    assert 'tenantId: session.tenantId' in route
    assert 'getLeadScopeForRole(session)' in route
    assert 'prisma.lead.findMany' in route
    assert "'Content-Type': 'text/event-stream; charset=utf-8'" in route
    assert 'event: lead' in route
    assert 'QUERY_INTERVAL_MS = 5_000' in route
    assert 'STREAM_LIFETIME_MS = 50_000' in route
    for forbidden in [
        'prisma.lead.create',
        'prisma.lead.update',
        'prisma.lead.delete',
        'dispatchFormSubmissionTracking',
        'dispatchKanbanStageTracking',
        'dispatchLeadPurchaseTracking',
        'TenantMetaConnection',
        'TenantWhatsAppConnection',
        'TenantInstagramConnection',
        'ALTER TABLE',
        'CREATE TABLE',
    ]:
        assert forbidden not in route

def test_client_uses_eventsource_so_hidden_tab_does_not_depend_on_browser_interval():
    center = read('components/lead-notification-center.tsx')
    assert 'new EventSource(`/api/notifications/leads/stream?' in center
    assert "source.addEventListener('lead'" in center
    assert 'deliverItems([item])' in center
    assert 'message.lastEventId' in center
    assert 'eventSourceRef.current?.close()' in center
    assert 'EventSource reconnects automatically' in center

def test_stream_and_polling_dedupe_before_sound_and_native_popup():
    center = read('components/lead-notification-center.tsx')
    assert 'const deliveredIdsRef = useRef<Set<string>>(new Set())' in center
    assert 'if (deliveredIdsRef.current.has(item.id)) return false' in center
    assert 'if (feed.items.length) deliverItems(feed.items)' in center
    assert 'void playLeadSound()' in center
    assert 'for (const item of fresh) void showNativeNotification(item)' in center
    assert 'deliveredIdsRef.current = new Set(storedItems.map((item) => item.id))' in center

def test_sse_change_does_not_touch_integrations_or_lead_creation():
    combined = '\n'.join([
        read('app/api/notifications/leads/stream/route.ts'),
        read('components/lead-notification-center.tsx'),
    ])
    for forbidden in [
        'prisma.lead.create',
        'prisma.lead.update',
        'prisma.lead.delete',
        'metaAccessToken',
        'PlatformMetaSettings',
        'TenantIntegrationSettings',
        'TenantWhatsAppConnection',
        'TenantInstagramConnection',
        'dispatchFormSubmissionTracking',
        'dispatchKanbanStageTracking',
        'dispatchLeadPurchaseTracking',
        'ALTER TABLE',
        'CREATE TABLE',
    ]:
        assert forbidden not in combined