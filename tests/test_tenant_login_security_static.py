from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def test_login_choice_after_password_and_before_session():
    login = (ROOT / "app/api/auth/login/route.ts").read_text()
    assert login.index("verifyPassword(password, user.passwordHash)") < login.index("decideLoginTenant(")
    assert login.index("decideLoginTenant(") < login.index("startSessionOrMfa({\n      userId: user.id,\n      tenantId: selectedMembership.tenantId")
    assert "new Set(allowedByTenant.keys())" in login
    assert "parsed.data.tenantId" in login
    assert "tenantSelectionRequired: true" in login

def test_owner_access_reconciliation_rejects_revoked_and_requires_admin_and_audit():
    route = (ROOT / "app/api/admin/tenants/[id]/users/[tenantUserId]/enable-login/route.ts").read_text()
    assert "withPlatformAdmin" in route
    assert "site !== 'same-origin'" in route
    assert "new URL(origin).origin !== new URL(req.url).origin" in route
    assert "status: 'active', role: 'owner'" in route
    assert "if (existing) return { status: 409" in route
    assert "tx.auditLog.create" in route
    assert "platform.owner_login_access_reconciled" in route
    assert "passwordHash" not in route
    assert "tenantUser.create" not in route
    assert "tenantUser.update" not in route
