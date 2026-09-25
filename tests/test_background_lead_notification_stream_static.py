from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def test_long_poll_endpoint_is_server_driven_read_only_and_scoped():
    route = read('app/api/notifications/leads/wait/route.ts')
    assert "export const runtime = 'nodejs'" in route
    assert 'export const maxDuration = 30' in route
    assert "withPermission('LEADS_VIEW'" in route
    assert 'tenantId: session.tenantId' in route
    assert 'getLeadScopeForRole(session)' in route
    assert 'prisma.lead.findMany' in route
    assert 'WAIT_TIMEOUT_MS = 20_000' in route
    assert 'CHECK_INTERVAL_MS = 2_000' in route
    assert "'Cache-Control': 'no-store'" in route
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

def test_client_uses_continuous_network_wait_not_eventsource_for_hidden_tabs():
    center = read('components/lead-notification-center.tsx')
    assert 'const watchAbortRef = useRef<AbortController | null>(null)' in center
    assert 'while (!cancelled)' in center
    assert 'fetch(`/api/notifications/leads/wait?${params.toString()}`' in center
    assert "cache: 'no-store'" in center
    assert 'signal: controller.signal' in center
    assert 'if (feed.items.length) deliverItems(feed.items)' in center
    assert 'watchAbortRef.current?.abort()' in center
    assert 'new EventSource(' not in center

def test_regular_polling_stays_enabled_as_foreground_fallback():
    center = read('components/lead-notification-center.tsx')
    assert 'const fallbackTimer = window.setInterval(() => void poll(), POLL_MS)' in center
    assert 'window.clearInterval(fallbackTimer)' in center
    assert "window.addEventListener('focus', refreshOnFocus)" in center
    assert "document.addEventListener('visibilitychange', refreshOnVisibility)" in center

def test_long_poll_and_fallback_dedupe_before_sound_and_native_popup():
    center = read('components/lead-notification-center.tsx')
    assert 'const deliveredIdsRef = useRef<Set<string>>(new Set())' in center
    assert 'if (deliveredIdsRef.current.has(item.id)) return false' in center
    assert 'void playLeadSound()' in center
    assert 'for (const item of fresh) void showNativeNotification(item)' in center
    assert 'deliveredIdsRef.current = new Set(storedItems.map((item) => item.id))' in center

def test_long_poll_change_does_not_touch_integrations_or_lead_creation():
    combined = '\n'.join([
        read('app/api/notifications/leads/wait/route.ts'),
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