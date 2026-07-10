from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_login_still_requires_active_tenant_user_and_allowed_user():
    login = read('app/api/auth/login/route.ts')
    assert "prisma.tenantUser.findMany" in login
    assert "where: { userId: user.id, status: 'active' }" in login
    assert "prisma.allowedUser.findMany" in login
    assert "active: true" in login
    assert "status: 'active'" in login
    assert "forbidden_no_active_allowed_tenant" in login


def test_post_users_creates_tenant_user_and_allowed_user_atomically():
    route = read('app/api/users/route.ts')
    assert "parsed.data.email.trim().toLowerCase()" in route
    assert "canManageRole(session.role, role, session.globalRole)" in route
    assert "prisma.$transaction" in route
    assert "BLOCKED_TENANT_STATUSES" in route
    assert "tx.tenantUser.create" in route
    assert "tx.tenantUser.update" in route
    assert "tx.allowedUser.upsert" in route
    assert "tenantId_email" in route
    assert "source: 'direct_user_creation'" in route
    assert "invitedBy: session.userId" in route
    assert "acceptedAt: new Date()" in route
    assert "accessAuthorized: true" in route
    assert "Usuário criado e liberado para acesso." in route


def test_post_users_security_cases_are_preserved():
    route = read('app/api/users/route.ts')
    assert "if (targetRole === 'owner') return false" in read('lib/rbac.ts')
    assert "USERS_CREATE_DIRECT: ['owner', 'admin']" in read('lib/rbac.ts')
    assert "Este usuário já pertence a esta empresa." in route
    assert "Este e-mail já possui acesso em outra empresa" in route
    assert "hasActiveOtherTenant" in route
    assert "passwordHash" in route
    assert "metadata: { role, email, creationMode: 'direct', tenantUserStatus: 'active', allowedUserStatus: 'active' }" in route
    assert "passwordHash" not in route.split("metadata: { role, email, creationMode: 'direct', tenantUserStatus: 'active', allowedUserStatus: 'active' }")[1]


def test_get_users_returns_access_authorization_status_for_ui():
    route = read('app/api/users/route.ts')
    ui = read('components/users-page-client.tsx')
    assert "prisma.allowedUser.findMany" in route
    assert "accessAuthorized" in route
    assert "accessStatus" in route
    assert "Acesso autorizado" in ui
    assert "Liberado" in ui
    assert "Pendente" in ui
    assert "Bloqueado" in ui
    assert "Usuário criado e liberado para acesso." in ui
    assert "setPassword('')" in ui
    assert "setConfirmPassword('')" in ui


def test_repair_script_is_idempotent_and_dry_run_safe():
    script = read('scripts/repair-direct-user-access.ts')
    package = read('package.json')
    assert 'users:repair-direct-access' in package
    assert "process.argv.includes('--dry-run')" in script
    assert "prisma.tenantUser.findMany" in script
    assert "status: 'active'" in script
    assert "prisma.allowedUser.findUnique" in script
    assert "prisma.allowedUser.upsert" in script
    assert "tenantId_email" in script
    assert "passwordHash" not in script
    assert "direct_user_access_repair" in script
