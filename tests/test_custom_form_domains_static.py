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


def test_domains_page_uses_guided_root_domain_and_subdomain_flow():
    page = read('app/(app)/domains/page.tsx')
    assert 'Adicionar domínio de formulário' in page
    assert 'Domínio principal' in page
    assert 'Subdomínio' in page
    assert "useState('leads')" in page
    assert '`${normalizedSubdomain}.${normalizedRootDomain}`' in page
    assert 'Seu link ficará assim:' in page
    assert 'Próximo passo: configurar DNS' in page


def test_domains_page_does_not_show_fixed_cloudflare_dns_before_creation():
    page = read('app/(app)/domains/page.tsx')
    intro = page.split('<Card className="p-5 space-y-5">', 1)[0]
    assert 'Cloudflare/DNS' not in intro
    assert 'Cloudflare &gt; Seu domínio &gt; DNS &gt; Records &gt; Add record.' not in page


def test_public_url_helper_describes_default_pending_and_active_states():
    helper = read('lib/forms/public-form-url.ts')
    assert 'buildPublicFormUrlState' in helper
    assert "state: 'default'" in helper
    assert "state: 'custom_pending'" in helper
    assert "state: 'custom_active'" in helper
    assert "Link padrão do FlipForm." in helper
    assert "Link padrão ativo enquanto o domínio personalizado aguarda verificação." in helper
    assert "Link gerado com o domínio personalizado ativo." in helper
    assert "params.primaryDomain.status === 'active'" in helper
    assert "params.primaryDomain.verificationStatus === 'verified'" in helper
    assert "params.primaryDomain.sslStatus === 'active'" in helper


def test_forms_api_returns_functional_public_url_and_custom_domain_metadata():
    route = read('app/api/forms/route.ts')
    assert 'buildPublicFormUrlState' in route
    assert 'publicUrl: urlState.activeUrl' in route
    assert 'publicUrlState: urlState.state' in route
    assert 'publicUrlLabel: urlState.label' in route
    assert 'customDomainUrl: urlState.customUrl' in route
    assert 'customDomainStatus:' in route
    assert 'where: { tenantId: session.tenantId, isPrimary: true }' in route


def test_forms_page_shows_pending_custom_domain_as_preview_and_copies_active_url():
    page = read('app/(app)/forms/page.tsx')
    assert "f.publicUrlState === 'custom_pending'" in page
    assert 'Link ativo:' in page
    assert 'Domínio personalizado pendente:' in page
    assert 'O domínio personalizado ainda está aguardando verificação em Domínios.' in page
    assert 'Domínio pendente' in page
    assert 'Domínio ativo' in page
    assert 'onClick={() => copyLink(f.publicUrl)}' in page


def test_domains_page_uses_warning_toast_for_pending_verification_and_status_texts():
    page = read('app/(app)/domains/page.tsx')
    assert "toast.success('Domínio verificado e ativo.')" in page
    assert "toast.warning('Domínio ainda aguardando configuração DNS.')" in page
    assert "toast.error('Não foi possível sincronizar o domínio com a Vercel.')" in page
    assert 'Após a verificação do DNS e ativação do SSL, os formulários desta conta passarão a usar esse domínio automaticamente.' in page
    assert 'Todos os formulários publicados nesta conta usam esse domínio automaticamente.' in page


def test_vercel_domain_sync_normalizes_dns_ssl_and_connection_states():
    helper = read('lib/custom-form-domains.ts')
    assert 'export async function syncDomainWithVercel(domain: string)' in helper
    assert "existsOnVercel: boolean" in helper
    assert "sslStatus: 'pending' | 'active' | 'failed' | 'unknown'" in helper
    assert "dns_change_required" in helper
    assert "ssl_pending" in helper
    assert "Integração com a Vercel não configurada. O domínio foi salvo, mas precisa ser adicionado manualmente na Vercel." in helper
    assert 'findDnsRecommendation(details) || findDnsRecommendation(verify)' in helper
    assert "state === 'active' ? 'active'" in helper


def test_verify_route_persists_detailed_vercel_sync_state():
    route = read('app/api/domains/[id]/verify/route.ts')
    assert 'syncDomainWithVercel(domain.domain)' in route
    assert 'sslStatus: result.sslStatus' in route
    assert 'vercelVerified: result.existsOnVercel && result.verified' in route
    assert 'dnsTarget: result.instruction.value' in route
    assert 'verifiedAt: result.verified && result.sslActive' in route
    assert 'connection: result.connection' in route


def test_domains_page_shows_vercel_recommended_target_before_fallback():
    page = read('app/(app)/domains/page.tsx')
    assert "const dnsTarget = d.dnsTarget || d.verificationValue || 'cname.vercel-dns.com';" in page
    assert 'Use exatamente o destino exibido acima. Se você alterou algo na Vercel, clique em Verificar agora para atualizar esta instrução.' in page
    assert 'Destino recomendado: ${domain.dnsTarget}' in page
    assert "toast.warning('A Vercel recomendou atualizar o DNS. Copie o novo destino exibido no card.')" in page
    assert "toast.warning('DNS verificado. SSL ainda pendente.')" in page
    assert "toast.success('Domínio verificado e ativo.')" in page
