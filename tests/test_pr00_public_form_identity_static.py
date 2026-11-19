from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def source(path):
    return (ROOT / path).read_text()

def test_resolver_rejects_unknown_host_and_slug_collisions():
    resolver = source('lib/forms/resolve-public-form-identity.ts')
    assert "if (!host) return null;" in resolver
    assert "if (!customDomain) return null;" in resolver
    assert "verificationStatus: 'verified'" in resolver
    assert "sslStatus: 'active'" in resolver
    assert "selectUniquePublicForm(candidates)" in resolver
    assert "take: 2" in resolver
    assert "getVerifiedLegacyFormAlias(slug, process.env.PR00_VERIFIED_LEGACY_FORM_ALIASES_JSON)" in resolver
    assert "if (!alias) return null;" in resolver
    assert "id: alias.formId, tenantId: alias.tenantId, isActive: true" in resolver
    assert resolver.index("if (platform) {") < resolver.index("const candidates = await prisma.form.findMany")
    assert "host.endsWith('.vercel.app')" not in resolver

def test_page_and_get_post_share_server_resolved_identity():
    for path in ['app/f/public-form-page.tsx', 'lib/forms/public-get-handler.ts', 'lib/forms/public-submit-handler.ts']:
        content = source(path)
        assert "resolvePublicFormIdentity(" in content
        assert "tenantId: identity.tenantId" in content
        assert "id: identity.id" in content

def test_canonical_routes_are_separate_from_legacy():
    assert "renderPublicForm({ formId, slug })" in source('app/f/id/[formId]/[slug]/page.tsx')
    assert "submitPublicForm(req, { formId:" in source('app/api/public/forms/by-id/[formId]/submit/route.ts')
    assert "getPublicForm(req, { formId:" in source('app/api/public/forms/by-id/[formId]/route.ts')
    assert "submitPublicForm(req, { slug:" in source('app/api/public/forms/[slug]/submit/route.ts')

def test_platform_links_use_form_uuid_without_changing_custom_domain_links():
    links = source('lib/forms/public-form-url.ts')
    assert "params.formId ? " in links
    assert "/f/id/" in links
    assert "customUrl" in links
    assert "formId: form.id" in source('app/api/forms/route.ts')
    assert "publicUrl: `/f/id/${form.id}/${form.slug}`" in source('lib/dashboard-metrics.ts')
    assert "f.publicUrl || `/f/id/${f.id}/${f.slug}`" in source('app/(app)/forms/page.tsx')
    assert "submitEndpoint:" in source('app/f/public-form-page.tsx')
    assert "formId: string;" in source('lib/forms/public-form-url.ts')
    assert 'legacyFallbackUrl' not in source('lib/forms/public-form-url.ts')
    tenant_helper = source('lib/custom-form-domains.ts')
    assert 'where: { tenantId, slug, isActive: true }' in tenant_helper
    assert 'formId: form.id' in tenant_helper

def test_existing_tracking_and_attribution_persist_in_shared_handler():
    handler = source('lib/forms/public-submit-handler.ts')
    for required in ('findExistingLeadIdByContactInTenant', 'dispatchFormSubmissionTracking',
                     'CONTACT_CONSENT_ACTION', 'protectDocumentAnswer', 'metaLeadEventId',
                     'parseAttributionCookies'):
        assert required in handler


def test_legacy_aliases_are_explicitly_reviewed_and_fail_closed():
    aliases = source('lib/forms/verified-legacy-form-aliases.ts')
    assert "manifestJson.length > 32768" in aliases
    assert "parsed.version !== 1" in aliases
    assert "parsed.verified.length > 200" in aliases
    assert "seen.has(row.slug)" in aliases
    assert "typeof row.evidenceRef !== 'string'" in aliases
    assert "UUID.test(row.formId)" in aliases
    assert "UUID.test(row.tenantId)" in aliases


def test_seed_example_uses_immutable_form_id():
    seed = source('prisma/seed.ts')
    assert 'Form público: /f/id/${form.id}/${form.slug}' in seed
    assert 'Form público: /f/${form.slug}' not in seed
