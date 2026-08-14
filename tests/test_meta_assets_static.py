from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_tenant_meta_asset_route_denies_discovery_and_binding():
    route = (ROOT / "app/api/integrations/meta/assets/route.ts").read_text()
    assert "withPermission('INTEGRATIONS_VIEW'" in route
    assert "withPermission('INTEGRATIONS_EDIT'" in route
    assert "META_ASSET_BINDING_ADMIN_ONLY" in route
    assert "status: 403" in route
    assert "listMetaAccessibleAdAccounts" not in route
    assert "listMetaAdAccountPixels" not in route
    assert "decryptIntegrationSecret" not in route
    assert "accessTokenEncrypted" not in route


def test_platform_admin_route_is_the_only_asset_discovery_and_binding_surface():
    route = (ROOT / "app/api/admin/integrations/meta/tenant-assets/route.ts").read_text()
    helper = (ROOT / "lib/meta/assets.ts").read_text()
    assert "withPlatformAdmin" in route
    assert "listMetaAccessibleAdAccounts" in route
    assert "listMetaAdAccountPixels" in route
    assert "validateMetaAdAccountPixelSelection" in route
    assert "decryptIntegrationSecret" in route
    assert "tenantId: parsed.data.tenantId" in route
    assert "META_ASSETS_BOUND_BY_PLATFORM_ADMIN" in route
    assert "prisma.$transaction" in route
    assert "tx.tenantMetaConnection.updateMany" in route
    assert "tx.auditLog.create" in route
    assert "logPlatformAudit" not in route
    assert "path: 'me/adaccounts'" in helper
    assert "Meta ad account is not authorized for this user" in helper
    assert "Meta pixel is not authorized for this ad account" in helper


def test_admin_binding_and_security_audit_are_atomic():
    route = (ROOT / "app/api/admin/integrations/meta/tenant-assets/route.ts").read_text()
    transaction_start = route.index("await prisma.$transaction(async (tx) =>")
    transaction_end = route.index("    });\n\n    return NextResponse.json", transaction_start)
    transaction = route[transaction_start:transaction_end]
    assert "tx.tenantMetaConnection.updateMany" in transaction
    assert "if (updated.count !== 1) throw new MetaBindingChangedError()" in transaction
    assert "tx.auditLog.create" in transaction
    assert "META_ASSETS_BOUND_BY_PLATFORM_ADMIN" in transaction


def test_tenant_ui_never_enumerates_meta_accounts_or_pixels():
    selector = (ROOT / "app/(app)/integrations/meta-asset-selector.tsx").read_text()
    assert "Ativos Meta vinculados" in selector
    assert "administrador da plataforma" in selector
    assert "nunca recebe a lista completa" in selector
    assert "fetch(" not in selector
    assert "resource=ad_accounts" not in selector
    assert "resource=pixels" not in selector
    assert "<select" not in selector


def test_platform_admin_ui_can_bind_one_account_and_pixel_to_a_tenant():
    page = (ROOT / "app/admin/(secure)/integrations/page.tsx").read_text()
    manager = (ROOT / "app/admin/(secure)/integrations/tenant-meta-binding-manager.tsx").read_text()
    assert "TenantMetaBindingManager" in page
    assert "/api/admin/integrations/meta/tenant-assets" in manager
    assert "Carregar contas acessíveis — somente Admin" in manager
    assert "Conta de anúncios do tenant" in manager
    assert "Pixel / Dataset do tenant" in manager
    assert "Vincular ativos ao tenant" in manager
    assert "accessToken" not in manager


def test_platform_admin_ui_discards_stale_tenant_and_account_responses():
    manager = (ROOT / "app/admin/(secure)/integrations/tenant-meta-binding-manager.tsx").read_text()
    assert "useRef" in manager
    assert "tenantEpochRef" in manager
    assert "activeTenantRef" in manager
    assert "accountsRequestRef" in manager
    assert "pixelsRequestRef" in manager
    assert "activeAdAccountRef" in manager
    assert "activeTenantRef.current !== nextTenantId" in manager
    assert "activeTenantRef.current !== requestedTenantId" in manager
    assert "activeAdAccountRef.current !== nextAdAccountId" in manager
    assert "accountsRequestRef.current !== requestId" in manager
    assert "pixelsRequestRef.current !== requestId" in manager


def test_meta_asset_selection_fields_are_nullable_and_migration_is_additive_only():
    schema = (ROOT / "prisma/schema.prisma").read_text()
    migration = (ROOT / "prisma/migrations/20260813042000_add_meta_asset_selection/migration.sql").read_text().upper()
    for field in (
        "metaBusinessId       String?",
        "metaAdAccountId      String?",
        "metaPixelId          String?",
        "assetsSelectedAt     DateTime?",
    ):
        assert field in schema
    assert 'ALTER TABLE "TENANT_META_CONNECTIONS"' in migration
    assert "ADD COLUMN" in migration
    for destructive in (" DELETE ", " DROP ", " TRUNCATE ", " UPDATE ", " INSERT "):
        assert destructive not in f" {migration} "


def test_connection_status_accepts_ad_account_and_pixel_without_business():
    route = (ROOT / "app/api/integrations/meta/connection/route.ts").read_text()
    assert "connection?.metaAdAccountId && connection.metaPixelId" in route
    assert "metaUserId:" not in route
    assert "metaUserName: connection?.metaUserName" in route
    assert "export const DELETE = withPermission('INTEGRATIONS_EDIT'" in route
    assert "status: 'revoked'" in route
    assert ".delete" not in route.lower()


def test_reauthorization_clears_only_meta_asset_selection_for_safety():
    callback = (ROOT / "app/api/integrations/meta/callback/route.ts").read_text()
    assert "getMetaUserProfile" in callback
    for field in (
        "metaBusinessId: null",
        "metaBusinessName: null",
        "metaAdAccountId: null",
        "metaAdAccountName: null",
        "metaPixelId: null",
        "metaPixelName: null",
        "assetsSelectedAt: null",
    ):
        assert field in callback
    assert "deleteMany" not in callback
    assert "DELETE FROM" not in callback.upper()


def test_ui_keeps_meta_identity_connection_actions_without_asset_discovery():
    parent = (ROOT / "app/(app)/integrations/integrations-client.tsx").read_text()
    assert "Identidade Meta conectada neste tenant" in parent
    assert "Trocar conta Meta" in parent
    assert "Desconectar" in parent
    assert "method: 'DELETE'" in parent
    assert "<MetaAssetSelector connection={metaConnection} onSaved={load} />" in parent
