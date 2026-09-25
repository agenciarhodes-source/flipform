from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def test_native_notification_keeps_service_worker_as_browser_fallback():
    center = read('components/lead-notification-center.tsx')
    worker = read('public/lead-notification-sw.js')
    assert "navigator.serviceWorker.register('/lead-notification-sw.js')" in center
    assert 'navigator.serviceWorker.ready' in center
    assert 'registration.showNotification(item.title' in center
    assert 'const notification = new Notification(item.title' in center
    assert center.index('const notification = new Notification(item.title') < center.index('registration.showNotification(item.title')
    assert "requireInteraction: true" in center
    assert "data: { href: item.href }" in center
    assert "self.addEventListener('notificationclick'" in worker
    assert "self.clients.matchAll({ type: 'window', includeUncontrolled: true })" in worker
    assert 'client.navigate(href)' in worker
    assert 'client.focus()' in worker
    assert 'self.clients.openWindow(href)' in worker

def test_notification_center_has_explicit_test_button():
    center = read('components/lead-notification-center.tsx')
    assert 'Testar notificação' in center
    assert 'async function testNativeNotification()' in center
    assert "title: 'Teste de notificação do FlipForm'" in center
    assert "leadName: 'As notificações estão funcionando'" in center
    assert "window.localStorage.setItem(nativeEnabledKey, 'enabled')" in center

def test_new_lead_sound_is_a_two_stage_bell_chime():
    center = read('components/lead-notification-center.tsx')
    assert 'const ring = (offset: number, fundamental: number)' in center
    assert "{ ratio: 1, gain: 0.12 }" in center
    assert "{ ratio: 2.01, gain: 0.055 }" in center
    assert "{ ratio: 3.9, gain: 0.025 }" in center
    assert 'ring(0, 1046.5)' in center
    assert 'ring(0.42, 1318.5)' in center
    assert 'start + 0.7' in center

def test_service_worker_fix_remains_isolated_from_data_and_integrations():
    combined = '\n'.join([
        read('components/lead-notification-center.tsx'),
        read('public/lead-notification-sw.js'),
    ])
    for forbidden in [
        'prisma.lead.create',
        'prisma.lead.update',
        'prisma.lead.delete',
        'metaAccessToken',
        'TenantMetaConnection',
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
