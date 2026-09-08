from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_meta_capi_uses_current_supported_graph_version_and_more_match_signals():
    capi = read('lib/tracking/meta-capi.ts')
    lead_data = read('lib/tracking/meta-lead-user-data.ts')
    assert "META_GRAPH_API_VERSION = 'v26.0'" in capi
    assert 'graph.facebook.com/${META_GRAPH_API_VERSION}' in capi
    assert 'v19.0' not in capi
    assert "'country'" in capi
    assert "addHashed(data, 'country'" in capi
    assert 'normalizeMetaName' in capi
    assert "country: inferMetaCountry" in lead_data
    assert "digits.startsWith('55')" in lead_data


def test_fbclid_is_promoted_to_first_party_fbc_before_public_submit():
    attribution = read('lib/attribution.ts')
    view = read('app/f/[slug]/public-form-view.tsx')
    assert 'buildMetaFbcFromFbclid' in attribution
    assert 'return `fb.1.${timestamp}.${clickId}`' in attribution
    assert "cookies.get('_fbc')" in attribution
    assert 'existing?.endsWith(`.${clickId}`)' in attribution
    assert 'document.cookie = `_fbc=' in attribution
    assert 'Max-Age=7776000' in attribution
    assert 'SameSite=Lax' in attribution
    assert 'ensureMetaFbcCookie(window.location.href' in view
    assert view.count('ensureMetaFbcCookie(window.location.href') >= 2


def test_public_form_preloads_only_non_secret_meta_pixel_identifier():
    standard = read('app/f/[slug]/page.tsx')
    custom = read('app/custom-domain/[slug]/page.tsx')
    view = read('app/f/[slug]/public-form-view.tsx')
    pixel = read('lib/tracking/meta-pixel-client.ts')

    for page in (standard, custom):
        assert 'resolveMetaRuntimeConfig' in page
        assert 'metaRuntime.pixelEnabled ? metaRuntime.pixelId : null' in page
        assert 'metaPixelId={publicMetaPixelId}' in page
        for secret in ('metaRuntime.accessToken', 'metaAccessTokenEncrypted', 'metaTestEventCode'):
            assert secret not in page

    assert 'initializeMetaPixel(metaPixelId)' in view
    assert "fbq('track', 'PageView')" in pixel
    assert "fbq('track', 'Lead', {}, { eventID: eventId })" in pixel


def test_non_meta_server_stubs_never_claim_sent_delivery():
    tracking = read('lib/tracking.ts')
    test_route = read('app/api/integrations/test-event/route.ts')

    forbidden = (
        "status: 'sent', reason: 'Evento Google Ads preparado",
        "status: 'sent', reason: 'Evento GA4 preparado",
        "status: 'sent', reason: 'Evento GTM preparado",
    )
    for value in forbidden:
        assert value not in tracking

    assert tracking.count("status: 'not_dispatched'") >= 6
    assert 'nenhuma conversão foi enviada por este provider' in tracking
    assert 'nenhum evento foi enviado por este provider' in tracking
    assert "status = 'not_dispatched'" in test_route
    assert 'resolveMetaRuntimeConfig({ tenantId: session.tenantId, legacySettings: settings })' in test_route
    assert 'decryptIntegrationSecret' not in test_route


def test_tracking_hardening_does_not_add_schema_or_dependency_workarounds():
    package = read('package.json')
    schema = read('prisma/schema.prisma')
    assert 'META_GRAPH_API_VERSION' not in package
    assert 'tracking_quality' not in schema.lower()
