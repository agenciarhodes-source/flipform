from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_meta_asset_route_is_tenant_scoped_and_permission_guarded():
    route = (ROOT / "app/api/integrations/meta/assets/route.ts").read_text()
    assert "withPermission('INTEGRATIONS_VIEW'" in route
    assert "withPermission('INTEGRATIONS_EDIT'" in route
    assert "session.tenantId" in route
    assert "decryptIntegrationSecret" in route
    assert "tenantId: session.tenantId" in route
    assert ".strict()" in route
    assert "accessTokenEncrypted" not in route.split("return NextResponse.json({\n      selection:", 1)[-1]


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


def test_meta_assets_are_revalidated_directly_from_connected_identity_before_persistence():
    route = (ROOT / "app/api/integrations/meta/assets/route.ts").read_text()
    helper = (ROOT / "lib/meta/assets.ts").read_text()
    assert "validateMetaAdAccountPixelSelection" in route
    assert "listMetaAccessibleAdAccounts" in route
    assert "path: 'me/adaccounts'" in helper
    assert "listMetaAdAccountPixels" in helper
    assert "Meta ad account is not authorized for this user" in helper
    assert "Meta pixel is not authorized for this ad account" in helper
    assert "businessId: numericIdSchema.optional()" in route


def test_integration_ui_is_ad_account_first_and_business_is_not_required():
    parent = (ROOT / "app/(app)/integrations/integrations-client.tsx").read_text()
    selector = (ROOT / "app/(app)/integrations/meta-asset-selector.tsx").read_text()
    assert "<MetaAssetSelector connection={metaConnection} onSaved={load} />" in parent
    assert "connection.status !== 'authorized'" in selector
    assert "resource=ad_accounts" in selector
    assert "resource=pixels&adAccountId=" in selector
    assert "body: JSON.stringify({ adAccountId, pixelId })" in selector
    assert "Conta de anúncios" in selector
    assert "Pixel / Dataset" in selector
    assert "<span>Empresa</span>" not in selector


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


def test_ui_exposes_meta_identity_switch_and_disconnect_actions():
    parent = (ROOT / "app/(app)/integrations/integrations-client.tsx").read_text()
    assert "Identidade Meta conectada neste tenant" in parent
    assert "Trocar conta Meta" in parent
    assert "Desconectar" in parent
    assert "method: 'DELETE'" in parent
    assert "Não é necessário usar o Gerenciador de Negócios da Pollo" in parent
