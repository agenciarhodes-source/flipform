from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTE = (ROOT / "app/api/public/forms/[slug]/submit/route.ts").read_text()
VIEW = (ROOT / "app/f/[slug]/public-form-view.tsx").read_text()
PIXEL = (ROOT / "lib/tracking/meta-pixel-client.ts").read_text()


def test_public_response_uses_tenant_settings_and_exposes_no_meta_secret():
    public_query = ROUTE.split("const publicMetaSettings", 1)[1].split("const publicMetaTracking", 1)[0]
    assert "where: { tenantId: form.tenantId }" in public_query
    assert "select: { metaPixelEnabled: true, metaPixelId: true }" in public_query
    for secret in ("metaAccessTokenEncrypted", "metaTestEventCode", "accessToken"):
        assert secret not in public_query
    assert "parsed.data.pixelId" not in ROUTE
    assert "parsed.data.tenantId" not in ROUTE


def test_pixel_runs_only_after_successful_submit_and_has_no_hostname_dependency():
    assert VIEW.index("if (!res.ok)") < VIEW.rindex("fireMetaLeadPixel")
    assert "app.flipform.com.br" not in PIXEL
    assert "'track', 'Lead', {}, { eventID: eventId }" in PIXEL
    assert "PageView" not in PIXEL
    for pii in ("email", "phone", "firstName", "lastName"):
        assert pii not in PIXEL
