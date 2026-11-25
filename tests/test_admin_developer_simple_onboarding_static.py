"""Developer account creation is separate from tenant grants."""
from pathlib import Path

def source(name):
    return Path(name).read_text(encoding="utf-8")

def test_create_developer_is_independent_of_company():
    api=source("app/api/admin/developer-accounts/route.ts")
    assert "withPlatformAdmin" in api
    assert "session.mfaVerifiedAt" in api
    assert "req.headers.get('origin')" in api
    assert "globalRole: 'developer_account'" in api
    assert "prisma.user.create" in api
    assert "tx.developerTenantGrant.create" not in api
    assert "tenantId: z.string().uuid()" not in api

def test_authorize_company_separately():
    page=source("app/admin/(secure)/developer-access/page.tsx")
    assert "1. Criar conta de Desenvolvedor" in page
    assert "2. Autorizar Desenvolvedor em uma empresa" in page
    assert "change('POST', userId, tenantId)" in page
    assert "newTenantId" not in page
    grant=source("app/api/admin/developer-access/route.ts")
    assert "tx.developerTenantGrant.upsert" in grant
    assert "user.globalRole !== 'developer_account'" in grant

def test_developer_access_is_scoped_and_mfa_is_still_mandatory():
    session=source("lib/session-access.ts")
    for term in ["mayUseDeveloperGrant({","mfaEnabled: !!account?.mfaEnabledAt","membershipActive: membership?.status === 'active'","allowlistActive:","role = 'developer'"]:
        assert term in session

def test_technical_modules_remain_developer_only():
    rbac=source("lib/rbac.ts")
    for permission in ["FLIP_AI_MANAGE","DOMAINS_VIEW","DOMAINS_MANAGE","INTEGRATIONS_VIEW","INTEGRATIONS_MANAGE"]:
        assert f"{permission}: ['developer']" in rbac
    assert "role === 'developer'" in source("lib/developer-access/route-policy.ts")

def test_lead_deletion_matches_existing_owner_only_api():
    rbac = source("lib/rbac.ts")
    helper = rbac.split("export function canDeleteLead(role: string): boolean", 1)[1].split("}", 1)[0]
    assert "return role === 'owner' && can(role, 'LEADS_DELETE');" in helper
    route = source("app/api/leads/[id]/route.ts")
    delete = route.split("export const DELETE", 1)[1]
    assert "session.role !== 'owner' || !canDeleteLead(session.role)" in delete
    assert "canDelete: canDeleteLead(session.role)" in route

def test_developer_plan_entitlements_remain():
    assert "session.role !== 'developer'" not in source("app/(app)/layout.tsx")
    assert "session.role !== 'developer'" not in source("lib/rbac-server.ts")
