import 'server-only';

import { prisma } from '@/lib/prisma';
import { buildPublicFormUrl as buildPublicFormUrlBase } from '@/lib/forms/public-form-url';
import { logAudit } from '@/lib/audit';

export const DEFAULT_APP_DOMAIN = 'app.flipform.com.br';
export const DEFAULT_VERCEL_DNS_TARGET = 'cname.vercel-dns.com';
export const REQUIRED_FORM_SUBDOMAIN = 'leads';
const RESERVED_DOMAINS = new Set(['flipform.com.br', 'www.flipform.com.br', DEFAULT_APP_DOMAIN]);

export type DnsInstruction = { type: 'CNAME' | 'A' | 'TXT'; name: string; value: string };
export type VercelConnectionState = 'vercel_not_configured' | 'not_on_vercel' | 'dns_change_required' | 'dns_pending' | 'ssl_pending' | 'active' | 'error';
export type VercelDomainSyncResult = {
  configured: boolean;
  existsOnVercel: boolean;
  addedToVercel: boolean;
  verified: boolean;
  sslActive: boolean;
  status: 'pending' | 'active' | 'error';
  verificationStatus: 'pending' | 'verified' | 'failed';
  sslStatus: 'pending' | 'active' | 'failed' | 'unknown';
  connectionState: VercelConnectionState;
  instruction: DnsInstruction;
  connection: { state: VercelConnectionState; title: string; description: string };
  reason?: string | null;
  raw?: unknown;
};

type VercelRequestResult = { ok: boolean; status: number; data: any };

export function getConfiguredAppDomain() {
  return (process.env.NEXT_PUBLIC_APP_DOMAIN || DEFAULT_APP_DOMAIN).replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
}

export function buildPublicFormUrl(params: { slug: string; primaryDomain?: string | null; appDomain?: string | null }) {
  return buildPublicFormUrlBase({
    slug: params.slug,
    primaryDomain: params.primaryDomain,
    appDomain: params.appDomain || getConfiguredAppDomain(),
  });
}

export function normalizeCustomDomain(input: string) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^https?:\/\//, '').split('/')[0].split('?')[0].split('#')[0].replace(/^www\./, '');
  }
}

export function validateCustomFormDomain(input: string) {
  const domain = normalizeCustomDomain(input);
  if (!domain) return { ok: false as const, domain, error: 'Informe um subdomínio.' };
  if (input.includes('/') && !input.startsWith('http://') && !input.startsWith('https://')) return { ok: false as const, domain, error: 'Informe apenas o domínio, sem caminho.' };
  if (domain === 'localhost' || domain.endsWith('.localhost')) return { ok: false as const, domain, error: 'localhost não é permitido.' };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return { ok: false as const, domain, error: 'Endereços IP não são permitidos.' };
  if (domain.endsWith('.vercel.app')) return { ok: false as const, domain, error: 'Domínios preview da Vercel não são permitidos.' };
  if (RESERVED_DOMAINS.has(domain) || domain === getConfiguredAppDomain()) return { ok: false as const, domain, error: 'Domínio reservado da FlipForm não é permitido.' };
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2,}[a-z]{2,63}$/.test(domain)) return { ok: false as const, domain, error: 'Informe um subdomínio válido, como leads.suaempresa.com.br.' };
  return { ok: true as const, domain };
}

export function hasPathQueryOrHash(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return (url.pathname && url.pathname !== '/') || Boolean(url.search || url.hash);
  } catch {
    const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
    return /[/?#]/.test(withoutProtocol);
  }
}

export function validateRootDomain(input: string) {
  const domain = normalizeCustomDomain(input);
  if (!domain) return { ok: false as const, domain, error: 'Informe o domínio principal.' };
  if (hasPathQueryOrHash(input)) return { ok: false as const, domain, error: 'Informe apenas o domínio principal, sem caminho.' };
  if (domain === 'localhost' || domain.endsWith('.localhost')) return { ok: false as const, domain, error: 'localhost não é permitido.' };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return { ok: false as const, domain, error: 'Endereços IP não são permitidos.' };
  if (domain.endsWith('.vercel.app')) return { ok: false as const, domain, error: 'Domínios preview da Vercel não são permitidos.' };
  if (RESERVED_DOMAINS.has(domain) || domain === getConfiguredAppDomain()) return { ok: false as const, domain, error: 'Domínio reservado da FlipForm não é permitido.' };
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) return { ok: false as const, domain, error: 'Informe um domínio válido, como suaempresa.com.br.' };
  return { ok: true as const, domain };
}

export function validateSubdomain(input: string) {
  const subdomain = String(input || REQUIRED_FORM_SUBDOMAIN).trim().toLowerCase();
  if (!subdomain) return { ok: false as const, subdomain, error: 'Informe o subdomínio.' };
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) return { ok: false as const, subdomain, error: 'Use apenas letras, números e hífen no subdomínio.' };
  if (subdomain !== REQUIRED_FORM_SUBDOMAIN) return { ok: false as const, subdomain, error: 'O subdomínio dos formulários deve ser sempre leads.' };
  return { ok: true as const, subdomain };
}

export function buildCustomFormDomainFromRoot(rootDomainInput: string) {
  const root = validateRootDomain(rootDomainInput);
  if (!root.ok) return root;
  const domain = `${REQUIRED_FORM_SUBDOMAIN}.${root.domain}`;
  const full = validateCustomFormDomain(domain);
  if (!full.ok) return full;
  return { ok: true as const, domain, rootDomain: root.domain, subdomain: REQUIRED_FORM_SUBDOMAIN };
}

export function buildCustomFormDomainFromParts(rootDomainInput: string, subdomainInput: string) {
  const sub = validateSubdomain(subdomainInput);
  if (!sub.ok) return { ok: false as const, domain: '', error: sub.error };
  return buildCustomFormDomainFromRoot(rootDomainInput);
}

export function buildCustomFormDomainFromFullDomain(domainInput: string) {
  const full = validateCustomFormDomain(domainInput);
  if (!full.ok) return full;
  const [subdomain, ...rootParts] = full.domain.split('.');
  if (subdomain !== REQUIRED_FORM_SUBDOMAIN) return { ok: false as const, domain: full.domain, error: 'O subdomínio dos formulários deve ser sempre leads.' };
  return { ok: true as const, domain: full.domain, rootDomain: rootParts.join('.'), subdomain: REQUIRED_FORM_SUBDOMAIN };
}

export async function getPrimaryCustomFormDomain(tenantId: string) {
  return prisma.customFormDomain.findFirst({ where: { tenantId, isPrimary: true, status: 'active', verificationStatus: 'verified', sslStatus: 'active' }, orderBy: { updatedAt: 'desc' } });
}

export async function getTenantPublicFormUrl(tenantId: string, slug: string) {
  const primary = await getPrimaryCustomFormDomain(tenantId);
  return buildPublicFormUrl({ slug, primaryDomain: primary?.domain });
}

export function getManualDnsInstruction(_domain: string, value = DEFAULT_VERCEL_DNS_TARGET): DnsInstruction {
  return { type: 'CNAME', name: REQUIRED_FORM_SUBDOMAIN, value };
}

function hasVercelDomainConfig() {
  return Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID && process.env.VERCEL_TEAM_ID);
}

function vercelApi(path: string) {
  const teamId = process.env.VERCEL_TEAM_ID;
  return `https://api.vercel.com${path}${teamId ? `${path.includes('?') ? '&' : '?'}teamId=${encodeURIComponent(teamId)}` : ''}`;
}

export async function vercelRequest(path: string, init: RequestInit = {}): Promise<VercelRequestResult> {
  const res = await fetch(vercelApi(path), { ...init, headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function findDnsRecommendation(value: any): DnsInstruction | null {
  const seen = new Set<any>();
  const walk = (node: any): DnsInstruction | null => {
    if (!node || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    const type = String(node.type || node.recordType || '').toUpperCase();
    const candidateValue = node.value || node.target || node.cname || node.configuredValue || node.expectedValue || node.recommendedValue || node.misconfigured?.value;
    const reason = String(node.reason || node.error?.message || '').toLowerCase();
    if (candidateValue && (type === 'CNAME' || String(candidateValue).includes('vercel-dns') || reason.includes('cname'))) {
      return { type: type === 'A' || type === 'TXT' ? type : 'CNAME', name: String(node.domain || node.name || node.host || '').replace(/\.$/, ''), value: String(candidateValue).replace(/\.$/, '') };
    }
    for (const child of Object.values(node)) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk(value);
}

export function hasSslActive(value: any) {
  const cert = value?.certs?.[0] || value?.certificate || value?.ssl;
  const text = JSON.stringify(cert || value || {}).toLowerCase();
  if (text.includes('invalid') || text.includes('error') || text.includes('failed')) return false;
  return Boolean(value?.verified && (value?.ready || value?.ssl?.status === 'active' || value?.certificate?.status === 'issued' || text.includes('issued') || text.includes('active')));
}

export function buildConnection(state: VercelConnectionState) {
  const map = {
    vercel_not_configured: { title: 'Integração Vercel não configurada', description: 'Configure VERCEL_TOKEN, VERCEL_PROJECT_ID e VERCEL_TEAM_ID para sincronizar domínios automaticamente.' },
    active: { title: 'Conexão ativa', description: 'Domínio verificado e SSL ativo.' },
    dns_pending: { title: 'Aguardando DNS', description: 'Crie ou atualize o CNAME informado e clique em Verificar agora.' },
    dns_change_required: { title: 'DNS precisa ser atualizado', description: 'A Vercel recomendou outro destino DNS. Atualize o CNAME na Cloudflare.' },
    ssl_pending: { title: 'DNS verificado', description: 'Aguardando ativação do SSL pela Vercel.' },
    not_on_vercel: { title: 'Domínio não vinculado à Vercel', description: 'O domínio existe no FlipForm, mas ainda não foi encontrado no projeto da Vercel.' },
    error: { title: 'Erro na conexão', description: 'Não foi possível sincronizar o domínio com a Vercel.' },
  } satisfies Record<VercelConnectionState, { title: string; description: string }>;
  return { state, ...map[state] };
}

function normalizeSync(domain: string, details: any, verify: any, existsOnVercel: boolean, addedToVercel: boolean, configured = true): VercelDomainSyncResult {
  const recommended = findDnsRecommendation(details) || findDnsRecommendation(verify);
  const instruction: DnsInstruction = { type: recommended?.type || 'CNAME', name: recommended?.name || REQUIRED_FORM_SUBDOMAIN, value: (recommended || getManualDnsInstruction(domain)).value };
  const verified = Boolean(details?.verified || verify?.verified);
  const sslActive = hasSslActive(details) || Boolean(verify?.sslActive);
  const hasDnsChange = Boolean(recommended && !verified);
  const failed = Boolean(details?.error || verify?.error);
  const connectionState: VercelConnectionState = !existsOnVercel ? 'not_on_vercel' : failed ? 'error' : verified && sslActive ? 'active' : verified ? 'ssl_pending' : hasDnsChange ? 'dns_change_required' : 'dns_pending';
  const reason = connectionState === 'ssl_pending' ? 'DNS verificado. Aguardando ativação do SSL.' : details?.error?.message || verify?.error?.message || details?.verification?.[0]?.reason || verify?.verification?.[0]?.reason || (connectionState === 'dns_change_required' ? 'A Vercel recomendou atualizar o DNS.' : null);
  return { configured, existsOnVercel, addedToVercel, verified, sslActive, status: connectionState === 'active' ? 'active' : failed ? 'error' : 'pending', verificationStatus: verified ? 'verified' : failed ? 'failed' : 'pending', sslStatus: sslActive ? 'active' : failed ? 'failed' : verified ? 'pending' : 'unknown', connectionState, instruction, connection: buildConnection(connectionState), reason, raw: { details, verify } };
}

function notConfiguredResult(domain: string): VercelDomainSyncResult {
  const connectionState: VercelConnectionState = 'vercel_not_configured';
  return { configured: false, existsOnVercel: false, addedToVercel: false, verified: false, sslActive: false, status: 'pending', verificationStatus: 'pending', sslStatus: 'unknown', connectionState, instruction: getManualDnsInstruction(domain), connection: buildConnection(connectionState), reason: 'Integração com a Vercel não configurada. Configure VERCEL_TOKEN, VERCEL_PROJECT_ID e VERCEL_TEAM_ID.' };
}

function notOnVercelResult(domain: string, reason: string, raw?: unknown): VercelDomainSyncResult {
  const connectionState: VercelConnectionState = 'not_on_vercel';
  return { configured: true, existsOnVercel: false, addedToVercel: false, verified: false, sslActive: false, status: 'pending', verificationStatus: 'pending', sslStatus: 'unknown', connectionState, instruction: getManualDnsInstruction(domain), connection: buildConnection(connectionState), reason, raw };
}

function errorResult(domain: string, error: any): VercelDomainSyncResult {
  console.error('vercel domain sync error', { domain, code: error?.code || error?.status || error?.data?.error?.code, message: error?.message || error?.data?.error?.message });
  const connectionState: VercelConnectionState = 'error';
  return { configured: true, existsOnVercel: false, addedToVercel: false, verified: false, sslActive: false, status: 'error', verificationStatus: 'failed', sslStatus: 'unknown', connectionState, instruction: getManualDnsInstruction(domain), connection: buildConnection(connectionState), reason: error?.message || error?.data?.error?.message || 'Não foi possível sincronizar o domínio com a Vercel.', raw: error };
}


export async function syncVercelProjectDomain(domain: string): Promise<VercelDomainSyncResult> {
  if (!hasVercelDomainConfig()) return notConfiguredResult(domain);
  try {
    const projectId = process.env.VERCEL_PROJECT_ID;
    let details = await vercelRequest(`/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`);
    let existsOnVercel = details.ok && !details.data?.error;
    let addedToVercel = false;

    if (!existsOnVercel && (details.status === 404 || details.data?.error?.code === 'not_found')) {
      const added = await vercelRequest(`/v10/projects/${projectId}/domains`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: domain }) });
      addedToVercel = added.ok;
      existsOnVercel = added.ok || added.data?.error?.code === 'domain_already_in_use' || added.data?.error?.code === 'domain_already_exists';
      if (!existsOnVercel) return notOnVercelResult(domain, added.data?.error?.message || 'Domínio não encontrado no projeto da Vercel.', { details: details.data, added: added.data });
      details = await vercelRequest(`/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`);
      if (!details.ok) details = added;
    }

    const verify = existsOnVercel ? await vercelRequest(`/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}/verify`, { method: 'POST' }) : { ok: false, status: 404, data: {} };
    return normalizeSync(domain, details.data, verify.data, existsOnVercel, addedToVercel, true);
  } catch (error: any) {
    return errorResult(domain, error);
  }
}

export async function syncDomainWithVercel(domain: string): Promise<VercelDomainSyncResult> {
  return syncVercelProjectDomain(domain);
}


export async function addDomainToVercel(domain: string) {
  return syncDomainWithVercel(domain);
}

export async function verifyDomainOnVercel(domain: string) {
  return syncDomainWithVercel(domain);
}


export async function activateCustomFormDomain(params: { domainId: string; actorUserId?: string | null; source: 'admin' | 'client_verify' | 'vercel_sync'; data?: Record<string, any> }) {
  const current = await prisma.customFormDomain.findUnique({ where: { id: params.domainId } });
  if (!current) return null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.customFormDomain.updateMany({
      where: { tenantId: current.tenantId, id: { not: current.id } },
      data: { isPrimary: false },
    });

    return tx.customFormDomain.update({
      where: { id: current.id },
      data: {
        ...(params.data || {}),
        status: 'active',
        verificationStatus: 'verified',
        sslStatus: 'active',
        vercelVerified: true,
        isPrimary: true,
        verificationReason: null,
        lastCheckedAt: new Date(),
        verifiedAt: new Date(),
      },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
  });

  await logAudit({
    tenantId: current.tenantId,
    userId: params.actorUserId ?? null,
    entityType: 'custom_form_domain',
    entityId: current.id,
    action: 'domain.activated',
    metadata: {
      domainId: current.id,
      domain: current.domain,
      tenantId: current.tenantId,
      source: params.source,
    },
  });

  return updated;
}
