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


def test_meta_assets_are_revalidated_server_side_before_persistence():
    route = (ROOT / "app/api/integrations/meta/assets/route.ts").read_text()
    helper = (ROOT / "lib/meta/assets.ts").read_text()
    assert "validateMetaAssetSelection" in route
    assert "listMetaBusinesses" in helper
    assert "listMetaBusinessAdAccounts" in helper
    assert "listMetaAdAccountPixels" in helper
    assert "Meta business is not authorized" in helper
    assert "Meta ad account is not authorized" in helper
    assert "Meta pixel is not authorized" in helper


def test_integration_ui_exposes_meta_asset_selector_only_after_authorization():
    parent = (ROOT / "app/(app)/integrations/integrations-client.tsx").read_text()
    selector = (ROOT / "app/(app)/integrations/meta-asset-selector.tsx").read_text()
    assert "<MetaAssetSelector connection={metaConnection} onSaved={load} />" in parent
    assert "connection.status !== 'authorized'" in selector
    assert "Salvar ativos Meta" in selector
    assert "Pixel / Dataset" in selector
