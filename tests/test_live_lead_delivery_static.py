from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def test_new_lead_dispatches_live_browser_event_and_in_app_toast():
    center = read('components/lead-notification-center.tsx')
    state = read('lib/notifications/browser-state.ts')
    assert "NEW_LEAD_BROWSER_EVENT = 'flipform:new-lead'" in state
    assert 'window.dispatchEvent(new CustomEvent(NEW_LEAD_BROWSER_EVENT, { detail: item }))' in center
    assert "document.visibilityState === 'visible'" in center
    assert 'toast(item.title' in center
    assert "label: 'Abrir lead'" in center

def test_kanban_refreshes_immediately_when_new_lead_event_arrives():
    kanban = read('app/(app)/kanban/page.tsx')
    assert 'NEW_LEAD_BROWSER_EVENT' in kanban
    assert 'const loadLeads = useCallback(async (silent = false)' in kanban
    assert "fetch(`/api/leads?${params.toString()}`, { cache: 'no-store' })" in kanban
    assert 'window.addEventListener(NEW_LEAD_BROWSER_EVENT, refreshForNewLead)' in kanban
    assert 'const refreshForNewLead = () => void loadLeads(true)' in kanban
    assert 'window.removeEventListener(NEW_LEAD_BROWSER_EVENT, refreshForNewLead)' in kanban

def test_kanban_has_silent_refresh_fallback_without_page_reload():
    kanban = read('app/(app)/kanban/page.tsx')
    assert 'window.setInterval(() => void loadLeads(true), 15_000)' in kanban
    assert "window.addEventListener('focus', refreshOnFocus)" in kanban
    assert "document.addEventListener('visibilitychange', refreshOnVisibility)" in kanban
    assert 'window.location.reload' not in kanban
    assert 'router.refresh()' not in kanban

def test_live_refresh_changes_are_read_only_outside_existing_kanban_move_action():
    center = read('components/lead-notification-center.tsx')
    state = read('lib/notifications/browser-state.ts')
    combined = '\n'.join([center, state])
    for forbidden in [
        'prisma.lead.create',
        'prisma.lead.update',
        'prisma.lead.delete',
        'metaAccessToken',
        'TenantMetaConnection',
        'TenantWhatsAppConnection',
        'TenantInstagramConnection',
        'ALTER TABLE',
        'CREATE TABLE',
    ]:
        assert forbidden not in combined
