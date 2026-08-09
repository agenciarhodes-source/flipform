from pathlib import Path


ROOT = Path(__file__).parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_meta_payload_has_explicit_advanced_user_fields():
    capi = read("lib/tracking/meta-capi.ts")
    for field in (
        "firstName", "lastName", "city", "state", "externalId", "fbc", "fbp",
        "clientIpAddress", "clientUserAgent",
    ):
        assert f"{field}?: string | null" in capi
    for key in ("'em'", "'ph'", "'fn'", "'ln'", "'ct'", "'st'", "'external_id'"):
        assert f"addHashed(data, {key}" in capi
    for key in ("'fbc'", "'fbp'", "'client_ip_address'", "'client_user_agent'"):
        assert f"addPlain(data, {key}" in capi


def test_enrichment_query_is_tenant_scoped_and_selects_optional_attribution_once():
    helper = read("lib/tracking/meta-lead-user-data.ts")
    assert "where: { id: params.leadId, tenantId: params.tenantId }" in helper
    assert helper.count("db.lead.findFirst") == 1
    assert "attribution: {" in helper
    for field in ("fbc: true", "fbp: true", "clientIp: true", "clientUserAgent: true", "landingPage: true"):
        assert field in helper
    assert "if (!lead) return { user: {}, landingPage: null }" in helper
    assert "attribution?.fbc" in helper
    assert "attribution?.landingPage ?? null" in helper


def test_tracking_preserves_action_source_and_only_uses_landing_page_for_public_form():
    tracking = read("lib/tracking.ts")
    assert "actionSource: context.source === 'public_form' ? 'website' : 'system_generated'" in tracking
    assert "eventSourceUrl: context.source === 'public_form' ? metaLeadData.landingPage : undefined" in tracking
    assert "user: metaLeadData.user" in tracking
    assert "saleValueCents" not in tracking


def test_no_schema_or_ci_change_is_part_of_advanced_meta_patch():
    # The feature is intentionally implemented from the already-existing models.
    helper = read("lib/tracking/meta-lead-user-data.ts")
    assert "prisma.leadAttribution.create" not in helper
    assert "delete" not in helper.lower()
    assert "updateMany" not in helper
