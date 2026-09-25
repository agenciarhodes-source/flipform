from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_group_account_creation_does_not_create_tenant_or_operational_data():
    service = read('services/admin/group-access-account-service.ts')
    assert 'prisma.user.create' in service
    assert 'hashPassword' in service
    assert "action: 'group_access.account_created'" in service
    for forbidden in [
        'createInternalTenant',
        'prisma.tenant.create',
        'prisma.tenantUser.create',
        'prisma.allowedUser.create',
        'prisma.subscription.create',
        'prisma.lead',
        'prisma.form',
        'prisma.pipeline',
        'prisma.tenantMetaConnection',
        'prisma.tenantWhatsAppConnection',
    ]:
        assert forbidden not in service


def test_admin_access_page_separates_group_account_from_direct_tenant_access():
    page = read('app/admin/(secure)/access/page.tsx')
    route = read('app/api/admin/allowed-users/route.ts')
    assert "value=\"group_account\"" in page
    assert 'Administrador / responsável de grupo' in page
    assert 'dono, administrador ou visualizador do grupo' in page
    assert 'Gestores de loja devem ser vinculados diretamente à empresa correspondente.' in page
    assert 'Nenhuma empresa técnica é criada.' in page
    assert "mode: 'group_account'" in page
    assert "payload.mode === 'group_account'" in route
    assert 'createGroupAccessAccount' in route


def test_group_configuration_uses_registered_user_id_not_freeform_email():
    page = read('app/admin/(secure)/groups/page.tsx')
    update = read('app/api/admin/business-groups/[id]/route.ts')
    helper = read('lib/business-groups.ts')
    assert 'Selecione um acesso cadastrado' in page
    assert 'availableAccesses.map' in page
    assert "member: { userId" in page
    assert 'userId: z.string().uuid().optional()' in update
    assert 'where: { id: input.userId }' in helper
    assert 'passwordHash' not in helper


def test_group_login_does_not_require_allowed_user_or_tenant_user_anchor():
    login = read('app/api/auth/login/route.ts')
    group_lookup = login.index('getBusinessGroupAccessesForUser(prisma, user.id)')
    group_gate = login.index('if (businessGroupAccess)')
    tenant_memberships = login.index('prisma.tenantUser.findMany')
    allowed_users = login.index('prisma.allowedUser.findMany')
    assert group_lookup < group_gate < tenant_memberships < allowed_users
    assert "tenantId: ''" in login[group_gate:tenant_memberships]
    assert "tenantSlug: ''" in login[group_gate:tenant_memberships]
    assert "return NextResponse.json({ ok: true, platformAdmin: false, businessGroupAccess: true })" in login


def test_existing_direct_access_path_is_preserved_for_non_group_users():
    login = read('app/api/auth/login/route.ts')
    access_route = read('app/api/admin/allowed-users/route.ts')
    assert 'prisma.tenantUser.findMany' in login
    assert 'prisma.allowedUser.findMany' in login
    assert 'selectedMembership' in login
    assert 'createManualAccess' in access_route
    assert "payload.mode === 'direct'" in access_route


def test_existing_group_access_can_be_reclassified_without_recreating_account():
    page = read('app/admin/(secure)/groups/page.tsx')
    update = read('app/api/admin/business-groups/[id]/route.ts')
    helper = read('lib/business-groups.ts')
    assert 'saveExistingMemberRole' in page
    assert "method: 'PATCH'" in page
    assert 'userId: member.userId' in page
    assert 'upsertBusinessGroupMember' in update
    assert 'ON CONFLICT (group_id, user_id)' in helper
    assert 'role = EXCLUDED.role' in helper
