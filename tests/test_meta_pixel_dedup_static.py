import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTE = (ROOT / "app/api/public/forms/[slug]/submit/route.ts").read_text()
VIEW = (ROOT / "app/f/[slug]/public-form-view.tsx").read_text()
PIXEL = (ROOT / "lib/tracking/meta-pixel-client.ts").read_text()
RUNTIME = (ROOT / "lib/meta/runtime.ts").read_text()
NEXT_CONFIG = (ROOT / "next.config.js").read_text()


def test_public_response_uses_server_side_meta_runtime_and_exposes_no_meta_secret():
    assert "resolveMetaRuntimeConfig({ tenantId: form.tenantId })" in ROUTE
    assert "toPublicMetaPixelConfig(metaRuntime, metaLeadEventId)" in ROUTE
    assert "tenantIntegrationSettings.findUnique" not in ROUTE
    assert "parsed.data.pixelId" not in ROUTE
    assert "parsed.data.tenantId" not in ROUTE

    public_helper = RUNTIME.split("export function toPublicMetaPixelConfig", 1)[1]
    assert "pixelId: config.pixelId" in public_helper
    assert "eventId" in public_helper
    for secret in ("accessToken", "testEventCode"):
        assert secret not in public_helper


def test_universal_runtime_is_tenant_scoped_and_keeps_legacy_only_as_fallback():
    assert "tenantId: input.tenantId" in RUNTIME
    assert "status: 'authorized'" in RUNTIME
    assert "metaPixelId: { not: null }" in RUNTIME
    assert "orderBy: { connectedAt: 'desc' }" in RUNTIME
    assert "source: 'universal'" in RUNTIME
    assert "source: 'legacy'" in RUNTIME
    assert RUNTIME.index("source: 'universal'") < RUNTIME.index("tenantIntegrationSettings.findUnique")


def test_pixel_runs_only_after_successful_qualified_submit_and_has_no_hostname_dependency():
    assert VIEW.index("if (!res.ok)") < VIEW.rindex("fireMetaLeadPixel")
    assert "result.qualified === true && result.tracking?.meta" in VIEW
    assert "app.flipform.com.br" not in PIXEL
    assert "'track', 'Lead', {}, { eventID: eventId }" in PIXEL
    assert "PageView" not in PIXEL
    for pii in ("email", "phone", "firstName", "lastName"):
        assert pii not in PIXEL


def test_csp_allows_only_the_required_meta_pixel_script_host():
    script_src_match = re.search(r'"script-src\s+([^"]+)"', NEXT_CONFIG)
    assert script_src_match is not None

    script_sources = script_src_match.group(1).split()
    assert "https://connect.facebook.net" in script_sources
    assert "https:" not in script_sources
    assert "*" not in script_sources
