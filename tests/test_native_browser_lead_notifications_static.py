from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def test_native_browser_notifications_require_explicit_user_permission():
    center = read('components/lead-notification-center.tsx')
    assert "'Notification' in window" in center
    assert 'Notification.requestPermission()' in center
    assert "browserPermission === 'denied'" in center
    assert 'Ativar avisos no navegador' in center
    assert 'Notificações estão bloqueadas no navegador' in center
    assert 'Este navegador não oferece notificações nativas compatíveis' in center

def test_new_lead_feed_can_show_native_notification_when_page_is_open():
    center = read('components/lead-notification-center.tsx')
    assert 'new Notification(item.title' in center
    assert 'for (const item of feed.items) showNativeNotification(item)' in center
    assert 'browserPermissionRef.current !== \'granted\'' in center
    assert '!nativeEnabledRef.current' in center
    assert 'tag: item.id' in center
    assert 'window.setTimeout(() => notification.close(), 12_000)' in center

def test_native_notification_click_focuses_flipform_and_opens_lead():
    center = read('components/lead-notification-center.tsx')
    assert 'notification.onclick = () =>' in center
    assert 'window.focus()' in center
    assert 'router.push(item.href)' in center
    assert 'notification.close()' in center

def test_native_notification_preference_is_local_only():
    center = read('components/lead-notification-center.tsx')
    state = read('lib/notifications/browser-state.ts')
    assert 'notificationNativeEnabledStorageKey' in center
    assert 'flipform:lead-notification-native-enabled:' in state
    assert "window.localStorage.setItem(nativeEnabledKey, enabled ? 'enabled' : 'disabled')" in center

def test_native_notification_layer_remains_read_only_and_integration_isolated():
    center = read('components/lead-notification-center.tsx')
    paths = [
        'components/lead-notification-center.tsx',
        'lib/notifications/browser-state.ts',
    ]
    combined = '\n'.join(read(path) for path in paths)
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
    for method in ['POST', 'PUT', 'PATCH', 'DELETE']:
        assert f"method: '{method}'" not in center
