from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def test_notification_center_can_clear_only_read_notifications():
    center = read('components/lead-notification-center.tsx')
    assert 'const readCount = items.length - unreadCount' in center
    assert 'function clearReadNotifications()' in center
    assert 'const seen = new Set(seenIds)' in center
    assert 'const remaining = items.filter((item) => !seen.has(item.id))' in center
    assert 'persistItems(remaining)' in center
    assert 'persistSeen(seenIds.filter((id) => remainingIds.has(id)))' in center
    assert "toast.success('Notificações lidas removidas.')" in center
    assert 'Limpar notificações lidas' in center
    assert 'Limpar lidas' in center
    assert '<Trash2 className="mr-1 h-3.5 w-3.5" />' in center

def test_notification_cleanup_keeps_unread_items_and_does_not_touch_server_data():
    center = read('components/lead-notification-center.tsx')
    start = center.index('function clearReadNotifications()')
    end = center.index('function openNotification', start)
    cleanup = center[start:end]
    assert 'items.filter((item) => !seen.has(item.id))' in cleanup
    assert 'persistItems(remaining)' in cleanup
    assert 'persistSeen(' in cleanup
    for forbidden in [
        'fetch(',
        'prisma.',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'Meta',
        'WhatsApp',
        'Instagram',
        'ALTER TABLE',
        'CREATE TABLE',
    ]:
        assert forbidden not in cleanup

def test_redundant_native_alert_explanation_is_removed():
    center = read('components/lead-notification-center.tsx')
    assert 'Alertas nativos estão habilitados.' not in center
    assert 'o aviso é disparado pelo Service Worker' not in center
