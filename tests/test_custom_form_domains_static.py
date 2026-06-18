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
    page = read('app/(app)/domains/page.tsx')
    assert 'Solicite a configuração de um subdomínio próprio para publicar seus' in page
    assert 'Solicitar domínio de formulário' in page
    assert 'Domínio principal' in page
    assert 'Subdomínio fixo' in page
    assert 'Subdomínio padrão: {REQUIRED_FORM_SUBDOMAIN}' in page
    assert 'O subdomínio dos formulários será sempre leads.' in page
    assert 'Solicitar configuração' in page
    assert 'setSubdomain' not in page
    assert 'normalizedSubdomain' not in page
    assert 'VERCEL_TOKEN' not in page
    assert 'VERCEL_PROJECT_ID' not in page
    assert 'VERCEL_TEAM_ID' not in page
    assert 'Integração com a Vercel não configurada' not in page
    assert 'Domínio não vinculado à Vercel' not in page
    assert 'Verificar agora' not in page


def test_domains_page_dns_appears_only_when_backoffice_set_target():
    page = read('app/(app)/domains/page.tsx')
    assert 'const dnsTarget = d.dnsTarget || d.verificationValue || "";' in page
    assert 'const shouldShowDns = Boolean(dnsTarget);' in page
    assert 'cname.vercel-dns.com' not in page
    assert 'Próximo passo: configurar DNS' in page
    assert 'Crie o registro abaixo na Cloudflare:' in page
    assert 'Proxy: DNS only' in page
    assert 'Use exatamente o destino informado acima. Depois de' in page
    assert 'Assim que o registro DNS estiver disponível, ele aparecerá' in page


def test_domains_page_status_labels_are_managed_flow():
    page = read('app/(app)/domains/page.tsx')
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
    assert 'status: "requested"' in route
    assert 'dnsTarget: null' in route
    assert 'syncVercelProjectDomain' not in route
    assert 'VERCEL_PROJECT_ID' not in route
    assert 'Solicitação recebida. Nosso time irá configurar o domínio e informar o próximo passo de DNS.' in route


def test_client_verify_route_does_not_call_vercel():
    route = read('app/api/domains/[id]/verify/route.ts')
    assert 'syncVercelProjectDomain' not in route
    assert 'A verificação de domínios é realizada pelo time FlipForm.' in route


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
    assert "action: \"admin.domain.updated\"" in patch_route


def test_admin_domains_page_allows_backoffice_management():
    page = read('app/admin/(secure)/domains/page.tsx')
    assert 'Domínios personalizados' in page
    assert 'Backoffice para configurar CNAME' in page
    assert '/api/admin/domains' in page
    assert 'DNS target/CNAME recomendado' in page
    assert 'Aguardando DNS' in page
    assert 'DNS verificado' in page
    assert 'Ativar' in page
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
