from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_portuguese_role_labels_and_levels_are_centralized():
    rbac = read('lib/rbac.ts')
    for text in [
        "owner: 'Dono da empresa'",
        "admin: 'Administrador'",
        "manager: 'Gestor'",
        "agent: 'Atendente/Vendedor'",
        "viewer: 'Visualizador'",
        'viewer: 10',
        'agent: 20',
        'manager: 30',
        'admin: 40',
        'owner: 50',
    ]:
        assert text in rbac


def test_role_management_hierarchy_blocks_owner_for_tenant_roles():
    rbac = read('lib/rbac.ts')
    assert "actorGlobalRole === 'platform_admin'" in rbac
    assert "if (targetRole === 'owner') return false" in rbac
    assert "actorRole === 'owner'" in rbac and "'admin', 'manager', 'agent', 'viewer'" in rbac
    assert "actorRole === 'admin'" in rbac and "'manager', 'agent', 'viewer'" in rbac
    invites = read('app/api/invites/route.ts')
    assert 'Apenas o Super Admin da plataforma pode definir um Dono da empresa.' in invites
    assert 'canManageRole(session.role, parsed.data.role, session.globalRole)' in invites


def test_agent_scope_is_enforced_for_lead_queries_and_access():
    rbac = read('lib/rbac.ts')
    assert "session.role === 'agent' ? { assignedTo: session.userId } : {}" in rbac
    leads_route = read('app/api/leads/route.ts')
    assert '...getLeadScopeForRole(session)' in leads_route
    lead_detail = read('app/api/leads/[id]/route.ts')
    assert 'assertCanAccessLead(session, lead)' in lead_detail
    assert "? ['name', 'email', 'phone', 'temperature']" in lead_detail


def test_viewer_and_export_permissions_are_readonly():
    rbac = read('lib/rbac.ts')
    assert "LEADS_VIEW_ALL: ['owner', 'admin', 'manager', 'viewer']" in rbac
    assert "KANBAN_VIEW_ALL: ['owner', 'admin', 'manager', 'viewer']" in rbac
    assert "REPORTS_EXPORT: ['owner', 'admin']" in rbac
    assert "LEADS_CREATE: ['owner', 'admin', 'manager', 'agent']" in rbac
    assert "KANBAN_MOVE_OWN: ['agent']" in rbac


def test_frontend_uses_portuguese_labels_for_roles():
    users = read('components/users-page-client.tsx')
    assert 'ROLE_LABELS_PT_BR' in users
    assert 'ROLE_SHORT_DESCRIPTIONS_PT_BR' in users
    assert 'canManageRole(actorRole, r)' in users
    account = read('app/(app)/account/page.tsx')
    assert 'PLATFORM_ADMIN_LABEL_PT_BR' in account
    invite_accept = read('app/invite/[token]/invite-accept-client.tsx')
    assert 'ROLE_LABELS_PT_BR[invite.role as RoleName]' in invite_accept
