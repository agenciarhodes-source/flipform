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


def test_custom_domain_public_resolution_uses_only_active_verified_domains():
    page = read('app/custom-domain/[slug]/page.tsx')
    assert 'domain: host' in page
    assert "status: 'active'" in page
    assert "verificationStatus: 'verified'" in page
    assert 'tenantId: customDomain.tenantId' in page
    assert 'slug: params.slug' in page


def test_public_url_helper_uses_fallback_until_domain_is_active():
    helper = read('lib/forms/public-form-url.ts')
    assert 'https://${appDomain}/f/${cleanSlug}' in helper
    assert 'https://${primaryDomain}/${cleanSlug}' in helper
    assert "state: 'custom_pending'" in helper
    assert "state: 'custom_active'" in helper
    assert "params.primaryDomain.status === 'active'" in helper
    assert "params.primaryDomain.verificationStatus === 'verified'" in helper
    assert "params.primaryDomain.sslStatus === 'active'" in helper


def test_domains_page_is_backoffice_managed_and_client_friendly():
    page = read('app/(app)/domains/domains-client.tsx')
    assert 'Solicite a configuração de um subdomínio próprio para publicar seus' in page
    assert 'Solicitar domínio de formulário' in page
    assert 'Domínio principal' in page
    assert 'Subdomínio fixo' in page
    assert 'Subdomínio obrigatório: {REQUIRED_FORM_SUBDOMAIN}' in page
    assert 'O subdomínio dos formulários será sempre leads.' in page
    assert 'Solicitar configuração' in page
    assert 'setSubdomain' not in page
    assert 'normalizedSubdomain' not in page
    assert 'VERCEL_TOKEN' not in page
    assert 'VERCEL_PROJECT_ID' not in page
    assert 'VERCEL_TEAM_ID' not in page
    assert 'Integração com a Vercel não configurada' not in page
    assert 'Domínio não vinculado à Vercel' not in page
    assert 'Verificar DNS' in page


def test_domains_page_dns_appears_only_when_backoffice_set_target():
    page = read('app/(app)/domains/domains-client.tsx')
    assert 'const dnsTarget = d.dnsTarget || d.verificationValue || "";' in page
    assert 'const shouldShowDns = Boolean(dnsTarget);' in page
    assert 'cname.vercel-dns.com' not in page
    assert 'Próximo passo: configurar DNS' in page
    assert 'Crie o registro abaixo na Cloudflare:' in page
    assert 'Proxy: DNS only' in page
    assert 'Use exatamente o destino informado acima na Cloudflare.' in page
    assert 'Seu domínio foi solicitado. O time FlipForm está configurando o destino DNS necessário para ativação.' in page


def test_domains_page_status_labels_are_managed_flow():
    page = read('app/(app)/domains/domains-client.tsx')
    assert 'Solicitação recebida' in page
    assert 'Aguardando configuração técnica' in page
    assert 'Aguardando DNS' in page
    assert 'DNS verificado' in page
    assert 'Conexão ativa' in page
    assert 'Ação necessária' in page
    assert 'Aguardando ativação do certificado SSL.' in page
    assert 'Houve um problema na configuração. Entre em contato com o suporte.' in page


def test_domains_api_creates_request_without_vercel_sync_or_custom_subdomain():
    route = read('app/api/domains/route.ts')
    assert 'buildCustomFormDomainFromRoot(' in route
    assert 'String(body.rootDomain || body.domain || "")' in route
    assert 'String(body.subdomain).trim().toLowerCase() !== "leads"' in route
    assert 'status: "pending"' in route
    assert 'dnsTarget: null' in route
    assert 'syncVercelProjectDomain' not in route
    assert 'VERCEL_PROJECT_ID' not in route
    assert 'Solicitação recebida. Nosso time irá configurar o domínio e informar o próximo passo de DNS.' in route


def test_client_verify_route_syncs_selected_domain_dynamically():
    route = read('app/api/domains/[id]/verify/route.ts')
    assert 'where: { id: ctx.params.id, tenantId: session.tenantId }' in route
    assert 'syncDomainWithVercel(domain.domain)' in route
    assert 'where: { id: domain.id }' in route
    assert 'domain: "leads.' not in route
    assert 'Domínio aguardando configuração técnica.' in route


def test_admin_domains_api_lists_and_updates_domains_with_one_primary_per_tenant():
    get_route = read('app/api/admin/domains/route.ts')
    patch_route = read('app/api/admin/domains/[id]/route.ts')
    assert 'withPlatformAdmin' in get_route
    assert 'prisma.customFormDomain.findMany' in get_route
    assert 'include: { tenant:' in get_route
    assert 'withPlatformAdmin' in patch_route
    assert '"dnsTarget"' in patch_route
    assert '"verificationValue"' in patch_route
    assert '"isPrimary"' in patch_route
    assert 'updateMany({' in patch_route
    assert 'tenantId: current.tenantId' in patch_route
    assert 'isPrimary: false' in patch_route
    assert "action: \"domain.admin_updated\"" in patch_route


def test_admin_domains_page_allows_backoffice_management():
    page = read('app/admin/(secure)/domains/page.tsx')
    assert 'Domínios' in page
    assert 'Backoffice para configurar CNAME' in page
    assert '/api/admin/domains' in page
    assert 'DNS target/CNAME recomendado' in page
    assert 'Aguardando DNS' in page
    assert 'SSL pendente' in page
    assert 'Marcar como ativo' in page
    assert 'Marcar principal' in page
    assert 'Abrir busca na Vercel' in page


def test_custom_domain_helper_requires_leads_subdomain_and_root_builder():
    helper = read('lib/custom-form-domains.ts')
    assert "export const REQUIRED_FORM_SUBDOMAIN = 'leads';" in helper
    assert 'export function buildCustomFormDomainFromRoot(rootDomainInput: string)' in helper
    assert 'const domain = `${REQUIRED_FORM_SUBDOMAIN}.${root.domain}`;' in helper
    assert "if (subdomain !== REQUIRED_FORM_SUBDOMAIN) return { ok: false as const, subdomain, error: 'O subdomínio dos formulários deve ser sempre leads.' };" in helper


def test_docs_describe_backoffice_operational_flow():
    doc = read('docs/operations/custom-form-domains.md')
    assert 'gerenciada pelo backoffice' in doc
    assert 'Backoffice acessa a Vercel' in doc
    assert 'copia o CNAME recomendado' in doc
    assert 'Cliente cria o CNAME na Cloudflare' in doc
    assert 'Não exibir `cname.vercel-dns.com` como fallback para clientes.' in doc


def test_admin_domain_action_endpoints_exist_and_audit_required_events():
    for path, action in [
        ('app/api/admin/domains/[id]/activate/route.ts', 'domain.activated'),
        ('app/api/admin/domains/[id]/mark-dns-pending/route.ts', 'domain.admin_dns_pending'),
        ('app/api/admin/domains/[id]/mark-ssl-pending/route.ts', 'domain.admin_ssl_pending'),
        ('app/api/admin/domains/[id]/mark-error/route.ts', 'domain.admin_error'),
    ]:
        content = read(path)
        assert 'withPlatformAdmin' in content
        if action == 'domain.activated':
            assert action in read('lib/custom-form-domains.ts')
        else:
            assert action in content
    patch_route = read('app/api/admin/domains/[id]/route.ts')
    assert '"vercelVerified"' in patch_route
    assert 'domain.admin_updated' in patch_route
    assert 'previousStatus' in patch_route
    assert 'newStatus' in patch_route


def test_custom_domain_public_route_resolves_by_active_host_and_ssl_gate():
    page = read('app/custom-domain/[slug]/page.tsx')
    assert "normalizeHostname(headers().get('host'))" in page
    assert "where: { domain: host, status: 'active', verificationStatus: 'verified', sslStatus: 'active' }" in page
    assert 'tenantId: customDomain.tenantId' in page
    assert 'slug: params.slug' in page
    submit = read('app/api/public/forms/[slug]/submit/route.ts')
    assert "sslStatus: 'active'" in submit


def test_forms_page_has_preview_and_functional_active_link_copy():
    page = read('app/(app)/forms/page.tsx')
    assert 'copyLink(f.publicUrl)' in page
    assert 'href={f.publicUrl || `/f/${f.slug}`}' in page
    assert 'Domínio personalizado pendente' in page
    assert 'Domínio pendente' in page


def test_custom_domain_flow_is_generic_for_multiple_tenants():
    route = read('app/api/domains/route.ts')
    assert 'buildCustomFormDomainFromRoot(' in route
    helper = read('lib/custom-form-domains.ts')
    assert "const domain = `${REQUIRED_FORM_SUBDOMAIN}.${root.domain}`;" in helper
    assert 'leads.tenant-a.com' not in route + helper
    assert 'leads.tenant-b.com' not in route + helper


def test_domain_activation_by_id_scopes_primary_to_same_tenant():
    helper = read('lib/custom-form-domains.ts')
    assert 'activateCustomFormDomain' in helper
    assert 'domainId: string' in helper
    assert 'where: { id: params.domainId }' in helper
    assert 'tenantId: current.tenantId, id: { not: current.id }' in helper
    assert 'isPrimary: false' in helper
    assert 'isPrimary: true' in helper


def test_form_links_use_only_active_primary_domain_for_tenant():
    route = read('app/api/forms/route.ts')
    assert "tenantId: session.tenantId" in route
    assert "isPrimary: true, status: 'active', verificationStatus: 'verified', sslStatus: 'active'" in route
    assert 'buildPublicFormUrlState' in route


def test_no_real_client_domain_references_in_custom_domain_static_suite():
    combined = '\n'.join(read(path) for path in [
        'app/api/domains/[id]/verify/route.ts',
        'app/api/admin/domains/[id]/activate/route.ts',
        'lib/custom-form-domains.ts',
        'app/custom-domain/[slug]/page.tsx',
        'app/api/forms/route.ts',
    ])
    assert 'WHERE domain =' not in combined
    assert 'domain: "leads.' not in combined



def test_domains_page_and_api_are_protected_by_domains_permissions():
    page = read('app/(app)/domains/page.tsx')
    assert 'can(session.role, "DOMAINS_VIEW")' in page
    assert 'redirect("/dashboard?error=permission-denied")' in page
    route = read('app/api/domains/route.ts')
    assert 'withPermission("DOMAINS_VIEW"' in route
    assert 'withPermission("DOMAINS_MANAGE"' in route
    for path in [
        'app/api/domains/[id]/route.ts',
        'app/api/domains/[id]/primary/route.ts',
        'app/api/domains/[id]/verify/route.ts',
    ]:
        assert 'DOMAINS_MANAGE' in read(path)
