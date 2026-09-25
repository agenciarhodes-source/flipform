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


def test_login_prioritizes_active_group_access_without_tenant_anchor():
    login_route = read('app/api/auth/login/route.ts')
    login_page = read('app/login/page.tsx')
    assert 'getBusinessGroupAccessesForUser(prisma, user.id)' in login_route
    assert 'const businessGroupAccess = groupState.schemaReady && groupState.accesses.length > 0' in login_route
    assert "tenantId: ''" in login_route
    assert "tenantSlug: ''" in login_route
    assert "action: 'auth.group_login'" in login_route
    assert login_route.index('getBusinessGroupAccessesForUser(prisma, user.id)') < login_route.index('prisma.tenantUser.findMany')
    assert login_route.index('if (businessGroupAccess)') < login_route.index('prisma.allowedUser.findMany')
    assert "router.push('/group')" in login_page


def test_non_group_login_keeps_existing_tenant_and_allowed_user_gate():
    login_route = read('app/api/auth/login/route.ts')
    assert 'prisma.tenantUser.findMany' in login_route
    assert 'prisma.allowedUser.findMany' in login_route
    assert "status: 'active'" in login_route
    assert 'active: true' in login_route
    assert 'selectedMembership' in login_route


def test_app_shell_and_layout_hide_group_hub_and_keep_group_route_recoverable():
    shell = read('components/app-shell.tsx')
    layout = read('app/(app)/layout.tsx')
    assert 'Visão do grupo' in shell
    assert 'hasCurrentTenantMembership' in shell
    assert 'isBusinessGroupAnchor' in shell
    assert 'groupWorkspaceNav' in shell
    assert '(inGroupView || isBusinessGroupAnchor) ? groupWorkspaceNav : baseNavItems' in shell
    for label in ['Dashboard', 'Leads', 'Formulários', 'Relatórios']:
        assert label in shell
    assert 'GROUP_ROLE_LABELS_PT_BR' in shell
    assert 'Gestor do grupo' in shell
    assert 'inGroupView' in shell
    assert 'Visão consolidada' in shell
    assert 'getBusinessGroupAccessesForUser(prisma, session.userId)' in layout
    assert 'prisma.tenantUser.findFirst' in layout
    assert 'currentTenantIsGroupTenant' in layout
    assert 'const isBusinessGroupAnchor = hasBusinessGroupAccess && !currentTenantIsGroupTenant' in layout
    assert 'if (isBusinessGroupAnchor && !isGroupRoute)' in layout
    assert 'isBusinessGroupAnchor={isBusinessGroupAnchor}' in layout
    assert '!billingAccess.allowAccess && !isBillingRoute && !isGroupRoute' in layout


def test_platform_admin_selects_registered_access_by_user_id():
    route = read('app/api/admin/business-groups/route.ts')
    update = read('app/api/admin/business-groups/[id]/route.ts')
    helper = read('lib/business-groups.ts')
    page = read('app/admin/(secure)/groups/page.tsx')
    assert 'withPlatformAdmin' in route
    assert 'withPlatformAdmin' in update
    assert 'availableAccesses' in helper
    assert "user.globalRole !== 'platform_admin'" in helper
    assert 'userId: z.string().uuid().optional()' in update
    assert 'userId: parsed.data.member.userId' in update
    assert 'availableAccesses.map' in page
    assert "member: { userId" in page
    assert 'passwordHash' not in helper
    assert 'upsertBusinessGroupMember' in update


def test_group_admin_storage_role_maps_to_tenant_manager_without_schema_change():
    helper = read('lib/business-groups.ts')
    update = read('app/api/admin/business-groups/[id]/route.ts')
    page = read('app/admin/(secure)/groups/page.tsx')
    assert "export type BusinessGroupRole = 'owner' | 'admin' | 'viewer'" in helper
    assert "role: z.enum(['owner', 'admin', 'viewer'])" in update
    assert "if (role === 'admin') return 'manager';" in helper
    assert "admin: 'Gestor do grupo'" in page
    assert "const GROUP_ROLES = ['owner', 'admin', 'viewer'] as const" in page


def test_platform_admin_can_edit_existing_group_member_level_inline():
    page = read('app/admin/(secure)/groups/page.tsx')
    assert 'memberEditRole' in page
    assert 'saveExistingMemberRole' in page
    assert 'userId: member.userId' in page
    assert 'Salvar nível' in page
    assert 'Nível de acesso de ${member.name}' in page


def test_group_manager_semantics_are_reused_by_flip_ai_access_check():
    access = read('lib/flip-ai/access.ts')
    assert 'mapBusinessGroupRoleToTenantRole' in access
    assert 'role = group ? mapBusinessGroupRoleToTenantRole(group.role) : null;' in access
