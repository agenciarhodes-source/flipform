"""A technical identity uses one password/MFA and a scoped tenant chooser."""
from pathlib import Path

LOGIN=Path("app/api/auth/login/route.ts").read_text(encoding="utf-8")
CREATE=Path("app/api/admin/developer-accounts/route.ts").read_text(encoding="utf-8")
GRANTS=Path("app/api/admin/developer-access/route.ts").read_text(encoding="utf-8")
SESSION=Path("lib/session-access.ts").read_text(encoding="utf-8")

def test_login_chooser_only_includes_active_grants_after_password():
    assert "verifyPassword(password, user.passwordHash)" in LOGIN
    assert "user.globalRole === 'developer_account'" in LOGIN
    assert "revokedAt: null" in LOGIN
    assert "if (!scoped.has(tenantId)) authorizedTenantIds.delete(tenantId)" in LOGIN
    assert "decideLoginTenant(typedMemberships, authorizedTenantIds, parsed.data.tenantId)" in LOGIN
    assert "tenantSelectionRequired: true" in LOGIN

def test_password_mfa_shared_without_global_super_admin():
    assert "globalRole: 'developer_account'" in CREATE
    assert "globalRole: 'platform_admin'" not in CREATE
    assert "mfaGate = await startSessionOrMfa" in LOGIN
    assert "mfaEnabled: !!account?.mfaEnabledAt" in SESSION
    assert "if (mayUseDeveloperGrant({" in SESSION

def test_no_arbitrary_customer_account_gets_new_technical_grant():
    assert "user.globalRole !== 'developer_account'" in GRANTS
    assert "developerTenantGrant.count" in GRANTS
