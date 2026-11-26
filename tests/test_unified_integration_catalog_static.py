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
    assert 'const tenantId = session.tenantId' in page
    assert page.count('count({ where: { tenantId,') == 3
    assert page.count('revokedAt: null') == 3
    tiles=read("app/(app)/integrations/connection-catalog.tsx")
    assert 'Conector ainda não homologado' in tiles
    assert 'Vínculos registrados não comprovam' in tiles
    assert 'fetch(' not in tiles
    assert 'api &&' in tiles
