from pathlib import Path


ROOT = Path(__file__).parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_prisma_model_relations_mappings_and_indexes():
    schema = read("prisma/schema.prisma")
    model = schema.split("model LeadAttribution {", 1)[1].split("\n}", 1)[0]
    assert 'leadId          String   @unique @map("lead_id")' in model
    assert 'tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)' in model
    assert 'lead   Lead   @relation(fields: [leadId], references: [id], onDelete: Cascade)' in model
    assert '@@map("lead_attributions")' in model
    for index in ("[tenantId]", "[tenantId, utmSource]", "[tenantId, utmCampaign]", "[tenantId, capturedAt]"):
        assert f"@@index({index})" in model
    assert "attribution  LeadAttribution?" in schema
    assert "leadAttributions      LeadAttribution[]" in schema


def test_public_schema_is_explicit_strict_and_bounded():
    schemas = read("lib/schemas.ts")
    attribution = schemas.split("export const publicAttributionSchema", 1)[1].split("export const publicSubmitSchema", 1)[0]
    for field in ("utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm", "fbclid", "gclid", "landingPage", "referrer"):
        assert f"{field}:" in attribution
    assert ").strict()" in attribution
    assert "nullableTrimmedAttributionString(255)" in attribution
    assert "nullableTrimmedAttributionString(1024)" in attribution
    assert "nullableTrimmedAttributionString(2048)" in attribution
    for forbidden in ("tenantId", "leadId", "clientIp", "clientUserAgent", "fbc:", "fbp:"):
        assert forbidden not in attribution
    submit = schemas.split("export const publicSubmitSchema", 1)[1].split("export const changePasswordSchema", 1)[0]
    assert "attribution: publicAttributionSchema.optional()" in submit
    assert ").strict()" in submit


def test_browser_capture_preserves_real_url_and_expected_params():
    helper = read("lib/attribution.ts")
    view = read("app/f/[slug]/public-form-view.tsx")
    for param in ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"):
        assert f"'{param}'" in helper
    assert "window.location.href" in view
    assert "document.referrer" in view
    assert "window.location.pathname" not in view
    assert "app.flipform.com.br" not in helper


def test_backend_values_are_server_derived_tenant_safe_and_resilient():
    route = read("app/api/public/forms/[slug]/submit/route.ts")
    assert "tenantId: form.tenantId" in route
    assert "leadId: lead.id" in route
    assert "getClientIp(req)" in route
    assert "req.headers.get('user-agent')" in route
    assert "parseAttributionCookies(req.headers.get('cookie'))" in route
    assert "requestIp === 'unknown' ? null" in route
    critical_end = route.index("// Attribution is deliberately outside")
    assert route.index("const lead = await prisma.$transaction") < critical_end
    persistence = route.index("await prisma.leadAttribution.create")
    tracking = route.index("await dispatchFormSubmissionTracking")
    assert critical_end < persistence < tracking
    assert "lead attribution persistence failed" in route
    log = route.split("lead attribution persistence failed", 1)[1].split("});", 1)[0]
    for sensitive in ("publicAttribution", "requestIp", "fbc", "fbp", "fbclid", "gclid", "landingPage"):
        assert sensitive not in log


def test_meta_cookies_are_selected_not_synthesized():
    helper = read("lib/attribution.ts")
    assert "cookies.get('_fbc')" in helper
    assert "cookies.get('_fbp')" in helper
    assert "fbclid" not in helper.split("export function parseAttributionCookies", 1)[1]


def test_migration_repair_and_non_runtime_readiness():
    migration = read("prisma/migrations/20260809120000_add_lead_attribution/migration.sql")
    repair = read("scripts/repair-production-schema.ts")
    readiness = read("lib/admin/assert-admin-schema-ready.ts")
    assert 'CREATE TABLE "lead_attributions"' in migration
    assert 'CREATE UNIQUE INDEX "lead_attributions_lead_id_key"' in migration
    assert migration.count("ON DELETE CASCADE") == 2
    assert "CREATE TABLE IF NOT EXISTS public.lead_attributions" in repair
    assert "CREATE UNIQUE INDEX IF NOT EXISTS lead_attributions_lead_id_key" in repair
    assert "lead_attributions" in readiness
    assert "'lead_attributions'" not in readiness.split("const RUNTIME_REQUIRED_TABLES", 1)[1].split(";", 1)[0]
    assert "index.lead_attributions.lead_id_unique" in readiness
    assert "runtimeEssential: false" in readiness
