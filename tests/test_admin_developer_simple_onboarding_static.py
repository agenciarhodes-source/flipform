"""Regression coverage for simple Super Admin developer onboarding and tenant isolation."""
from pathlib import Path


def source(name):
    return Path(name).read_text(encoding="utf-8")


def test_admin_creates_developer_and_first_grant_atomically():
    api = source("app/api/admin/developer-accounts/route.ts")
    assert "withPlatformAdmin" in api
    assert "session.mfaVerifiedAt" in api
    assert "req.headers.get('origin')" in api
    assert "prisma.$transaction" in api
    assert "tx.user.create" in api
    assert "tx.tenantUser.create" in api
    assert "tx.allowedUser.create" in api
    assert "tx.developerTenantGrant.create" in api
    assert "role: 'viewer'" in api
    assert "globalRole: null" in api


def test_admin_can_authorize_additional_companies():
    page = source("app/admin/(secure)/developer-access/page.tsx")
    assert "Criar e autorizar Desenvolvedor" in page
    assert "Adicionar empresa a um Desenvolvedor" in page
    assert "newTenantId" in page
    assert "password: newPassword, tenantId: newTenantId" in page
    assert "change('POST', userId, tenantId)" in page


def test_developer_access_is_scoped_and_mfa_is_still_mandatory():
    session = source("lib/session-access.ts")
    assert "mayUseDeveloperGrant({" in session
    assert "mfaEnabled: !!account?.mfaEnabledAt" in session
    assert "membershipActive: membership?.status === 'active'" in session
    assert "allowlistActive:" in session
    assert "role = 'developer'" in session


def test_technical_modules_remain_developer_only():
    rbac = source("lib/rbac.ts")
    for permission in ["FLIP_AI_MANAGE", "DOMAINS_VIEW", "DOMAINS_MANAGE", "INTEGRATIONS_VIEW", "INTEGRATIONS_MANAGE"]:
        assert f"{permission}: ['developer']" in rbac
    policy = source("lib/developer-access/route-policy.ts")
    assert "role === 'developer'" in policy


def test_developer_can_delete_leads_and_plan_entitlements_remain():
    rbac = source("lib/rbac.ts")
    assert "(role === 'owner' || role === 'developer')" in rbac
    layout = source("app/(app)/layout.tsx")
    assert 'isInboxOnlyPlan(tenant?.plan?.slug)' in layout
    assert "session.role !== 'developer'" not in layout
    server = source("lib/rbac-server.ts")
    assert "session.role !== 'developer'" not in server
