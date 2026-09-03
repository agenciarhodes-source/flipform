from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_hierarchy_is_tenant_scoped_and_server_authoritative():
    source = read('lib/team-hierarchy.ts')
    assert 'WHERE tenant_id = ${tenantId}' in source
    assert "where: { tenantId, status: 'active' }" in source
    assert 'tenantId: session.tenantId' not in source
    route = read('app/api/team/hierarchy/route.ts')
    assert 'tenantId: session.tenantId' in route
    assert 'tenantId' not in read('components/team-overview-client.tsx')


def test_hierarchy_has_safe_explicit_activation_and_legacy_fallback():
    source = read('lib/team-hierarchy.ts')
    assert 'schemaReady: false, hierarchyConfigured: false, hierarchyEnabled: false' in source
    assert 'const legacyMode = !snapshot.schemaReady || !snapshot.hierarchyEnabled' in source
    assert 'hierarchy can be drafted without changing any current view' in source
    assert 'tenant_team_hierarchy_settings' in source
    assert 'setHierarchyEnabled' in source
    client = read('components/team-overview-client.tsx')
    assert 'Ativar hierarquia' in client
    assert 'Modo de compatibilidade ativo.' in client


def test_activation_requires_links_for_managers_and_agents():
    source = read('lib/team-hierarchy.ts')
    assert "['manager', 'agent'].includes(member.role)" in source
    assert 'Antes de ativar, vincule um superior para:' in source
    assert 'Cadastre os vínculos da equipe antes de ativar a hierarquia.' in source


def test_hierarchy_prevents_self_cycles_and_invalid_role_direction():
    source = read('lib/team-hierarchy.ts')
    assert 'Um usuário não pode supervisionar a si mesmo.' in source
    assert 'Este vínculo criaria um ciclo na hierarquia.' in source
    assert 'ROLE_LEVEL[superior.role]' in source
    assert 'ROLE_LEVEL[subordinate.role]' in source


def test_team_overview_is_read_only_for_business_data():
    route = read('app/api/team/overview/route.ts')
    forbidden = [
        'prisma.lead.create', 'prisma.lead.update', 'prisma.lead.delete',
        'prisma.form.update', 'prisma.pipeline.update',
        'prisma.tenantMetaConnection', 'prisma.tenantIntegrationSettings.update',
        'prisma.tenantWhatsAppConnection', 'prisma.conversation.update',
        'metaAccessToken', 'googleAds', 'gtmContainer', 'whatsappSystemUser',
    ]
    for token in forbidden:
        assert token not in route
    assert 'prisma.lead.findMany' in route
    assert 'prisma.leadPurchase.findMany' in route
    assert 'resolveOperationalScope' in route


def test_hierarchy_write_only_touches_hierarchy_tables_and_audit():
    source = read('lib/team-hierarchy.ts')
    assert 'DELETE FROM tenant_user_hierarchy' in source
    assert 'INSERT INTO tenant_user_hierarchy' in source
    assert 'INSERT INTO tenant_team_hierarchy_settings' in source
    for table in ['leads', 'forms', 'pipelines', 'tenant_meta_connections', 'tenant_integration_settings', 'tenant_whatsapp_connections', 'conversations', 'messages']:
        assert f'DELETE FROM {table}' not in source
        assert f'INSERT INTO {table}' not in source
        assert f'UPDATE {table}' not in source


def test_schema_change_is_additive_and_never_auto_migrate_deploy():
    migration = read('prisma/migrations/20260903003000_add_tenant_user_hierarchy/migration.sql')
    workflow = read('.github/workflows/repair-team-hierarchy-schema.yml')
    assert 'CREATE TABLE IF NOT EXISTS public.tenant_user_hierarchy' in migration
    assert 'CREATE TABLE IF NOT EXISTS public.tenant_team_hierarchy_settings' in migration
    assert 'enabled BOOLEAN NOT NULL DEFAULT FALSE' in migration
    assert 'CREATE INDEX IF NOT EXISTS' in migration
    assert 'DROP TABLE' not in migration.upper()
    assert 'TRUNCATE' not in migration.upper()
    assert '\nUPDATE ' not in migration.upper()
    assert 'prisma db execute' in workflow
    assert 'prisma migrate deploy' not in workflow
    assert 'workflow_dispatch' in workflow


def test_team_page_does_not_impersonate_or_replace_session():
    client = read('components/team-overview-client.tsx')
    overview = read('app/api/team/overview/route.ts')
    assert 'impersonat' not in client.lower()
    assert '/api/auth/login' not in client
    assert 'scopeTenantUserId' in client
    assert 'selectedTenantUserId' in overview
    assert 'userId: session.userId' in overview


def test_team_navigation_is_limited_to_supervisory_roles():
    shell = read('components/app-shell.tsx')
    page = read('app/(app)/team/page.tsx')
    assert 'href: "/team"' in shell
    assert "['owner', 'admin', 'manager'].includes(role)" in shell
    assert "!['owner', 'admin', 'manager'].includes(session.role)" in page
