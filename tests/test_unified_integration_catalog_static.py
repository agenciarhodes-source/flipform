from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def read(path): return (ROOT / path).read_text(encoding="utf-8")
def test_catalog_has_stable_global_ids():
    catalog=read("lib/integration-catalog/catalog.ts")
    for app in ["whatsapp","instagram","tiktok","google-ads","google-search","google-business","meta-ads","chatgpt-ads","gojus","crm","agenda","erp","asaas","other"]:
        assert "id:'"+app+"'" in catalog
    assert 'process.env' not in catalog and 'fetch(' not in catalog
def test_catalog_status_counts_use_current_tenant():
    page=read("app/(app)/integrations/page.tsx")
    assert 'readCatalogConnectionCounts()' in page
    assert 'prisma.' not in page
    service=read("lib/integration-catalog/connection-counts.ts")
    assert "import 'server-only'" in service
    assert 'getVerifiedSession()' in service
    assert "can(session.role, 'INTEGRATIONS_VIEW')" in service
    assert 'const tenantId = session.tenantId' in service
    assert service.count('count({ where: { tenantId,') == 3
    assert service.count('revokedAt: null') == 3
    assert service.count('prisma.') == 3
    assert 'if (inboxOnly) return' in service
    tiles=read("app/(app)/integrations/connection-catalog.tsx")
    assert 'Conector ainda não homologado' in tiles
    assert 'Vínculos registrados não comprovam' in tiles
    assert 'fetch(' not in tiles
    assert 'api &&' in tiles

def test_catalog_refreshes_after_existing_connection_changes():
    tiles=read("app/(app)/integrations/connection-catalog.tsx")
    assert 'WHATSAPP_CONNECTION_CHANGED_EVENT' in tiles
    assert 'WHATSAPP_NUMBERS_CHANGED' in tiles
    assert 'CATALOG_CONNECTION_CHANGED_EVENT' in tiles
    assert 'router.refresh()' in tiles
    assert 'removeEventListener' in tiles
    for path in ["instagram-business-login-card.tsx","integrations-client.tsx"]:
        assert 'notifyCatalogConnectionChanged();' in read("app/(app)/integrations/"+path)
