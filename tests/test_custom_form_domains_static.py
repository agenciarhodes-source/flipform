from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_custom_domain_schema_is_tenant_scoped_and_domain_unique():
    schema = read('prisma/schema.prisma')
    assert 'model CustomFormDomain' in schema
    assert 'tenantId           String    @map("tenant_id")' in schema
    assert 'domain             String    @unique' in schema
    assert '@@index([tenantId, isPrimary])' in schema
    assert '@@index([verificationStatus])' in schema
    assert 'customFormDomains    CustomFormDomain[]' in schema


def test_form_slugs_are_unique_per_tenant_not_global():
    schema = read('prisma/schema.prisma')
    form_model = schema.split('model Form {', 1)[1].split('\n}', 1)[0]
    assert 'slug              String   @unique' not in form_model
    assert '@@unique([tenantId, slug])' in form_model


def test_custom_domain_public_resolution_uses_host_tenant_and_slug():
    page = read('app/custom-domain/[slug]/page.tsx')
    assert 'domain: host' in page
    assert "status: 'active'" in page
    assert "verificationStatus: 'verified'" in page
    assert 'tenantId: customDomain.tenantId' in page
    assert 'slug: params.slug' in page


def test_submit_route_scopes_custom_domain_submissions_to_domain_tenant():
    route = read('app/api/public/forms/[slug]/submit/route.ts')
    assert 'req.headers.get(\'host\')' in route
    assert 'prisma.customFormDomain.findFirst' in route
    assert 'tenantId: customDomain.tenantId' in route


def test_public_url_helper_uses_primary_domain_or_platform_fallback():
    helper = read('lib/forms/public-form-url.ts')
    assert 'https://${primaryDomain}/${cleanSlug}' in helper
    assert 'https://${appDomain}/f/${cleanSlug}' in helper
