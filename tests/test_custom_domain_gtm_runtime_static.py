from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CUSTOM_DOMAIN_PAGE = ROOT / 'app/custom-domain/[slug]/page.tsx'


def read(path: Path) -> str:
    return path.read_text()


def test_custom_domain_loads_tracking_from_owning_tenant_only():
    page = read(CUSTOM_DOMAIN_PAGE)
    assert 'tenantIntegrationSettings.findUnique' in page
    assert 'where: { tenantId: customDomain.tenantId }' in page
    assert 'select: { gtmEnabled: true, gtmContainerId: true }' in page
    assert 'gtmSettings?.gtmEnabled ? gtmSettings.gtmContainerId : null' in page
    assert 'resolveMetaRuntimeConfig({ tenantId: customDomain.tenantId })' in page
    assert 'metaRuntime.pixelEnabled ? metaRuntime.pixelId : null' in page
    assert '<PublicFormView gtmContainerId={publicGtmContainerId} metaPixelId={publicMetaPixelId}' in page


def test_custom_domain_exposes_no_sensitive_integration_data():
    page = read(CUSTOM_DOMAIN_PAGE)
    runtime_block = page[page.index('const [gtmSettings, metaRuntime] ='):page.index('const logoUrl =')]
    for sensitive in [
        'metaAccessToken',
        'ga4ApiSecret',
        'accessToken',
        'clientSecret',
        'phone',
        'email',
        'leadId',
    ]:
        assert sensitive not in runtime_block


def test_custom_domain_security_and_form_resolution_are_preserved():
    page = read(CUSTOM_DOMAIN_PAGE)
    assert "status: 'active', verificationStatus: 'verified', sslStatus: 'active'" in page
    assert 'where: { tenantId: customDomain.tenantId, slug: params.slug, isActive: true }' in page
    assert "BLOCKED.has(String(form.tenant.status))" in page


def test_gtm_disabled_tenant_receives_no_container():
    page = read(CUSTOM_DOMAIN_PAGE)
    assert 'gtmSettings?.gtmEnabled ? gtmSettings.gtmContainerId : null' in page
