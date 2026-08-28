from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'app/f/[slug]/page.tsx'
VIEW = ROOT / 'app/f/[slug]/public-form-view.tsx'
GTM = ROOT / 'lib/tracking/gtm-client.ts'


def read(path: Path) -> str:
    return path.read_text()


def test_public_page_exposes_only_non_secret_gtm_runtime_config():
    page = read(PAGE)
    assert 'tenantIntegrationSettings.findUnique' in page
    assert 'select: { gtmEnabled: true, gtmContainerId: true }' in page
    assert 'gtmSettings?.gtmEnabled ? gtmSettings.gtmContainerId : null' in page
    runtime_block = page[page.index('const gtmSettings ='):page.index('// Logo:')]
    for secret in ['metaAccessToken', 'ga4ApiSecret', 'accessToken', 'phone', 'email']:
        assert secret not in runtime_block


def test_gtm_container_is_loaded_only_from_valid_gtm_id():
    gtm = read(GTM)
    assert "const GTM_CONTAINER_ID_PATTERN = /^GTM-[A-Z0-9]+$/" in gtm
    assert "https://www.googletagmanager.com/gtm.js?id=" in gtm
    assert 'if (!normalized) return false' in gtm
    assert "document.getElementById(scriptId)" in gtm


def test_public_submit_fires_gtm_only_after_successful_qualified_response():
    view = read(VIEW)
    response_ok = view.index('if (!res.ok)')
    result_parse = view.index('const result: PublicFormSubmitResponse = await res.json();')
    qualified = view.index('if (result.qualified === true)')
    gtm_fire = view.index('firePublicGtmLeadEvent(gtmContainerId)', qualified)
    assert response_ok < result_parse < qualified < gtm_fire


def test_duplicate_or_failed_submission_cannot_reach_gtm_event():
    view = read(VIEW)
    error_throw = view.index('throw new Error(msg);')
    result_parse = view.index('const result: PublicFormSubmitResponse = await res.json();')
    gtm_fire = view.index('firePublicGtmLeadEvent(gtmContainerId)')
    assert error_throw < result_parse < gtm_fire


def test_gtm_lead_payload_contains_no_pii_or_internal_lead_id():
    gtm = read(GTM)
    payload_line = "dataLayer.push({ event: FLIPFORM_LEAD_EVENT });"
    assert payload_line in gtm
    event_function = gtm[gtm.index('export function firePublicGtmLeadEvent'):]
    for pii in ['email', 'phone', 'name', 'cpf', 'cnpj', 'leadId', 'lead_id']:
        assert pii not in event_function


def test_meta_pixel_behavior_remains_inside_same_qualified_success_path():
    view = read(VIEW)
    qualified = view.index('if (result.qualified === true)')
    meta_guard = view.index('if (result.tracking?.meta)', qualified)
    meta_fire = view.index('fireMetaLeadPixel(result.tracking.meta)', meta_guard)
    assert qualified < meta_guard < meta_fire


def test_tracking_failures_are_non_blocking_for_form_experience():
    gtm = read(GTM)
    assert 'Tracking must never interrupt the public form experience.' in gtm
    assert 'A tracking failure must not change a successful form submission.' in gtm
    assert gtm.count('return false;') >= 4
