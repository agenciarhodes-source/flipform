from pathlib import Path
from tests.flip_voice_legacy_audit_fixture import historical_pr01_candidate
ROOT=Path(__file__).resolve().parents[1]
def read(path): return (ROOT/path).read_text(encoding="utf-8")
def test_global_catalog_additive_and_no_tenant_or_provider_writes():
    sql=read("prisma/migrations/20261126170000_platform_integration_catalog/migration.sql")
    assert sql.count("CREATE TABLE")==2
    assert "ON DELETE RESTRICT" in sql
    assert "tenant_id" not in sql and "DROP TABLE" not in sql
    assert "model PlatformCatalogApp" not in historical_pr01_candidate(read("prisma/schema.prisma"))
    store=read("lib/integration-catalog/store.ts")
    assert "Serializable" in store and "platformCatalogAudit.create" in store and "revision:input.expectedRevision" in store
    assert "tenant.update" not in store and "fetch(" not in store
def test_admin_and_icon_security():
    route=read("app/api/admin/integrations/catalog/route.ts")
    assert "GET=withPlatformAdmin" in route and "PUT=withPlatformAdmin" in route
    assert "req.headers.get('origin')!==req.nextUrl.origin" in route and "size>100000" in route
    icon=read("app/api/integrations/catalog/icon/[id]/route.ts")
    assert "getVerifiedSessionFromRequest" in icon and "image/png" in icon and "nosniff" in icon
    assert "validateIcon" in icon
def test_catalog_is_presentation_only():
    page=read("app/(app)/integrations/page.tsx")
    assert "readGlobalCatalog()" in page and "catalogAvailable={catalog.available}" in page
    tiles=read("app/(app)/integrations/connection-catalog.tsx")
    assert "visibleApps(apps,planSlug,universal,inboxOnly)" in tiles
    assert "Conector ainda não homologado" in tiles
