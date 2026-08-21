from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_meta_ads_diagnostics_is_strictly_read_only():
    diagnostics = read('lib/meta/ads-diagnostics.ts')

    assert "method: 'GET'" in diagnostics
    assert "path: `${adAccountId}/campaigns`" in diagnostics
    assert "path: `${adAccountId}/activities`" in diagnostics
    assert 'account_status,disable_reason' in diagnostics
    assert 'effective_status' in diagnostics
    for forbidden in (
        "method: 'POST'",
        "method: 'PUT'",
        "method: 'PATCH'",
        "method: 'DELETE'",
        "status: 'PAUSED'",
        "status: 'ACTIVE'",
    ):
        assert forbidden not in diagnostics


def test_meta_ads_diagnostics_route_is_platform_admin_tenant_scoped_and_server_only():
    route = read('app/api/admin/integrations/meta/tenant-diagnostics/route.ts')

    assert 'withPlatformAdmin' in route
    assert "req.nextUrl.searchParams.get('tenantId')" in route
    assert "where: { tenantId: tenantParsed.data, status: 'authorized' }" in route
    assert 'decryptIntegrationSecret(connection.accessTokenEncrypted)' in route
    assert 'getMetaAdsReadOnlyDiagnostics({' in route
    assert 'readOnly: true' in route
    assert 'accessToken,' in route
    assert 'accessToken:' not in route.split('return NextResponse.json({', 1)[1]
    assert "method: 'POST'" not in route
    assert "method: 'PUT'" not in route
    assert "method: 'DELETE'" not in route


def test_same_meta_identity_reauthorization_preserves_existing_asset_binding():
    callback = read('app/api/integrations/meta/callback/route.ts')

    assert 'existingAssetBindingPreserved: true' in callback
    assert 'Keep the already validated tenant -> ad account -> Pixel binding intact' in callback
    for destructive_reset in (
        'metaAdAccountId: null',
        'metaAdAccountName: null',
        'metaPixelId: null',
        'metaPixelName: null',
        'assetsSelectedAt: null',
    ):
        assert destructive_reset not in callback


def test_admin_diagnostics_ui_declares_and_uses_read_only_api():
    panel = read('app/admin/(secure)/integrations/meta-ads-safety-diagnostics-panel.tsx')
    page = read('app/admin/(secure)/meta-diagnostics/page.tsx')

    assert 'somente leitura' in panel.lower()
    assert 'Não pausa, ativa, edita ou exclui campanhas.' in panel
    assert '/api/admin/integrations/meta/tenant-diagnostics?tenantId=' in panel
    assert 'Alterado por:' in panel
    assert 'Histórico de atividades do Ads Manager' in panel
    assert 'MetaAdsSafetyDiagnosticsPanel' in page
    for forbidden in ("method: 'POST'", "method: 'PUT'", "method: 'PATCH'", "method: 'DELETE'"):
        assert forbidden not in panel


def test_diagnostics_change_does_not_touch_crm_or_customer_records():
    paths = [
        'lib/meta/ads-diagnostics.ts',
        'app/api/admin/integrations/meta/tenant-diagnostics/route.ts',
        'app/api/integrations/meta/callback/route.ts',
        'app/admin/(secure)/integrations/meta-ads-safety-diagnostics-panel.tsx',
    ]
    combined = '\n'.join(read(path) for path in paths)
    for forbidden in (
        'prisma.lead.',
        'tx.lead.',
        'prisma.pipeline.',
        'tx.pipeline.',
        'prisma.form.',
        'tx.form.',
        'DELETE FROM',
        'TRUNCATE ',
    ):
        assert forbidden not in combined
