from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_business_group_schema_is_additive_only():
    sql = read('prisma/migrations/20260903233000_add_business_groups/migration.sql').lower()
    assert 'create table if not exists business_groups' in sql
    assert 'create table if not exists business_group_tenants' in sql
    assert 'create table if not exists business_group_users' in sql
    for forbidden in ['drop table', 'truncate', 'delete from leads', 'update leads', 'delete from forms', 'update tenant_meta']:
        assert forbidden not in sql


def test_business_group_repair_never_runs_migrate_deploy():
    workflow = read('.github/workflows/repair-business-group-schema.yml')
    assert 'prisma db execute' in workflow
    assert '20260903233000_add_business_groups/migration.sql' in workflow
    assert 'run: npx prisma migrate deploy' not in workflow
    assert 'continue-on-error: true' in workflow


def test_group_access_is_server_authoritative_and_schema_safe():
    source = read('lib/business-groups.ts')
    assert 'WHERE bgu.user_id = ${userId}' in source
    assert 'INNER JOIN business_group_tenants' in source or 'FROM business_group_tenants' in source
    assert 'schemaReady: false, accesses: []' in source
    assert 'findAuthorizedBusinessGroupTenant' in source
    assert "Esta empresa não pertence ao seu grupo empresarial" in source


def test_group_switch_validates_signed_session_membership_and_target_billing_before_cookie():
    route = read('app/api/business-groups/switch/route.ts')
    assert 'getSessionFromRequest(req)' in route
    assert 'withAuth' not in route
    assert 'getBusinessGroupAccessesForUser(prisma, session.userId)' in route
    assert 'findAuthorizedBusinessGroupTenant(state, parsed.data)' in route
    assert 'evaluateBillingAccess' in route
    assert 'if (!billing.allowAccess)' in route
    assert 'await setSessionCookie' in route
    assert route.index('findAuthorizedBusinessGroupTenant') < route.index('await setSessionCookie')
    assert route.index('if (!billing.allowAccess)') < route.index('await setSessionCookie')
    assert "action: 'business_group.tenant_switched'" in route


def test_group_overview_is_read_only_and_not_trapped_by_current_tenant_billing():
    route = read('app/api/business-groups/overview/route.ts')
    assert 'getSessionFromRequest(req)' in route
    assert 'withAuth' not in route
    assert 'getBusinessGroupAccessesForUser(prisma, session.userId)' in route
    assert 'tenantId: { in: tenantIds }' in route
    assert 'prisma.lead.findMany' in route
    assert 'prisma.leadPurchase.findMany' in route
    forbidden = ['prisma.lead.create', 'prisma.lead.update', 'prisma.lead.delete', 'prisma.form.update', 'prisma.pipeline.update', 'prisma.tenantMetaConnection']
    for token in forbidden:
        assert token not in route


def test_login_redirects_group_users_without_changing_existing_membership_gate():
    login_route = read('app/api/auth/login/route.ts')
    login_page = read('app/login/page.tsx')
    assert "prisma.tenantUser.findMany" in login_route
    assert "prisma.allowedUser.findMany" in login_route
    assert 'getBusinessGroupAccessesForUser(prisma, user.id)' in login_route
    assert 'businessGroupAccess' in login_route
    assert "router.push('/group')" in login_page


def test_app_shell_and_layout_hide_anchor_tenant_and_keep_group_route_recoverable():
    shell = read('components/app-shell.tsx')
    layout = read('app/(app)/layout.tsx')
    assert 'Visão do grupo' in shell
    assert 'hasCurrentTenantMembership' in shell
    assert 'isBusinessGroupAnchor' in shell
    assert 'isBusinessGroupAnchor ? groupNav : baseNavItems' in shell
    assert 'GROUP_ROLE_LABELS_PT_BR' in shell
    assert 'Administrador do grupo' in shell
    assert 'inGroupView' in shell
    assert 'Visão consolidada' in shell
    assert 'getBusinessGroupAccessesForUser(prisma, session.userId)' in layout
    assert 'prisma.tenantUser.findFirst' in layout
    assert 'currentTenantIsGroupTenant' in layout
    assert 'const isBusinessGroupAnchor = hasBusinessGroupAccess && !currentTenantIsGroupTenant' in layout
    assert 'if (isBusinessGroupAnchor && !isGroupRoute)' in layout
    assert 'isBusinessGroupAnchor={isBusinessGroupAnchor}' in layout
    assert '!billingAccess.allowAccess && !isBillingRoute && !isGroupRoute' in layout


def test_platform_admin_controls_groups_and_existing_users_only():
    route = read('app/api/admin/business-groups/route.ts')
    update = read('app/api/admin/business-groups/[id]/route.ts')
    helper = read('lib/business-groups.ts')
    assert 'withPlatformAdmin' in route
    assert 'withPlatformAdmin' in update
    assert 'db.user.findUnique({ where: { email }' in helper
    assert 'passwordHash' not in helper
    assert 'upsertBusinessGroupMember' in update
