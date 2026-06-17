import 'server-only';

import { prisma } from '@/lib/prisma';
import { buildPublicFormUrl as buildPublicFormUrlBase } from '@/lib/forms/public-form-url';

export const DEFAULT_APP_DOMAIN = 'app.flipform.com.br';
export const DEFAULT_VERCEL_DNS_TARGET = 'cname.vercel-dns.com';
const RESERVED_DOMAINS = new Set(['flipform.com.br', 'www.flipform.com.br', DEFAULT_APP_DOMAIN]);

export type DnsInstruction = { type: 'CNAME' | 'A' | 'TXT'; name: string; value: string };
export type VercelConnectionState = 'active' | 'dns_pending' | 'dns_change_required' | 'ssl_pending' | 'not_on_vercel' | 'error';
export type VercelDomainSyncResult = {
  configured: boolean;
  existsOnVercel: boolean;
  verified: boolean;
  sslActive: boolean;
  status: 'pending' | 'active' | 'error';
  verificationStatus: 'pending' | 'verified' | 'failed';
  sslStatus: 'pending' | 'active' | 'failed' | 'unknown';
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

export function validateRootDomain(input: string) {
  const domain = normalizeCustomDomain(input);
  if (!domain) return { ok: false as const, domain, error: 'Informe o domínio principal.' };
  if (domain === 'localhost' || domain.endsWith('.localhost')) return { ok: false as const, domain, error: 'localhost não é permitido.' };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) return { ok: false as const, domain, error: 'Endereços IP não são permitidos.' };
  if (domain.endsWith('.vercel.app')) return { ok: false as const, domain, error: 'Domínios preview da Vercel não são permitidos.' };
  if (RESERVED_DOMAINS.has(domain) || domain === getConfiguredAppDomain()) return { ok: false as const, domain, error: 'Domínio reservado da FlipForm não é permitido.' };
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) return { ok: false as const, domain, error: 'Informe um domínio válido, como suaempresa.com.br.' };
  return { ok: true as const, domain };
}

export function validateSubdomain(input: string) {
  const subdomain = String(input || 'leads').trim().toLowerCase();
  if (!subdomain) return { ok: false as const, subdomain, error: 'Informe o subdomínio.' };
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) return { ok: false as const, subdomain, error: 'Use apenas letras, números e hífen no subdomínio.' };
  return { ok: true as const, subdomain };
}

export function buildCustomFormDomainFromParts(rootDomainInput: string, subdomainInput: string) {
  const root = validateRootDomain(rootDomainInput);
  if (!root.ok) return root;
  const sub = validateSubdomain(subdomainInput);
  if (!sub.ok) return { ok: false as const, domain: '', error: sub.error };
  const domain = `${sub.subdomain}.${root.domain}`;
  const full = validateCustomFormDomain(domain);
  if (!full.ok) return full;
  return { ok: true as const, domain, rootDomain: root.domain, subdomain: sub.subdomain };
}

export async function getPrimaryCustomFormDomain(tenantId: string) {
  return prisma.customFormDomain.findFirst({ where: { tenantId, isPrimary: true, status: 'active', verificationStatus: 'verified' }, orderBy: { updatedAt: 'desc' } });
}

export async function getTenantPublicFormUrl(tenantId: string, slug: string) {
  const primary = await getPrimaryCustomFormDomain(tenantId);
  return buildPublicFormUrl({ slug, primaryDomain: primary?.domain });
}

export function getManualDnsInstruction(domain: string, value = DEFAULT_VERCEL_DNS_TARGET): DnsInstruction {
  return { type: 'CNAME', name: domain.split('.')[0] || domain, value };
}

function vercelApi(path: string) {
  const teamId = process.env.VERCEL_TEAM_ID;
  return `https://api.vercel.com${path}${teamId ? `${path.includes('?') ? '&' : '?'}teamId=${teamId}` : ''}`;
}

async function vercelRequest(path: string, init: RequestInit = {}): Promise<VercelRequestResult> {
  const res = await fetch(vercelApi(path), { ...init, headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function findDnsRecommendation(value: any): DnsInstruction | null {
  const seen = new Set<any>();
  const walk = (node: any): DnsInstruction | null => {
    if (!node || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    const type = String(node.type || node.recordType || '').toUpperCase();
    const candidateValue = node.value || node.target || node.cname || node.configuredValue || node.expectedValue || node.recommendedValue;
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

function hasSslActive(value: any) {
  const cert = value?.certs?.[0] || value?.certificate || value?.ssl;
  const text = JSON.stringify(cert || value || {}).toLowerCase();
  if (text.includes('invalid') || text.includes('error') || text.includes('failed')) return false;
  return Boolean(value?.verified && (value?.ready || value?.ssl?.status === 'active' || value?.certificate?.status === 'issued' || text.includes('issued') || text.includes('active')));
}

function buildConnection(state: VercelConnectionState) {
  const map = {
    active: { title: 'Conexão ativa', description: 'Domínio verificado e SSL ativo.' },
    dns_pending: { title: 'Aguardando DNS', description: 'Crie ou atualize o CNAME informado e clique em Verificar agora.' },
    dns_change_required: { title: 'DNS precisa ser atualizado', description: 'A Vercel recomendou um destino DNS diferente. Atualize o CNAME na Cloudflare.' },
    ssl_pending: { title: 'DNS verificado', description: 'Aguardando ativação do SSL pela Vercel.' },
    not_on_vercel: { title: 'Domínio não vinculado à Vercel', description: 'O domínio existe no FlipForm, mas ainda não foi encontrado no projeto da Vercel.' },
    error: { title: 'Erro na conexão', description: 'Não foi possível sincronizar o domínio com a Vercel.' },
  } satisfies Record<VercelConnectionState, { title: string; description: string }>;
  return { state, ...map[state] };
}

function normalizeSync(domain: string, details: any, verify: any, existsOnVercel: boolean, configured = true): VercelDomainSyncResult {
  const recommended = findDnsRecommendation(details) || findDnsRecommendation(verify);
  const instruction = { ...(recommended || getManualDnsInstruction(domain)), name: (recommended?.name || domain.split('.')[0] || domain) };
  const verified = Boolean(details?.verified || verify?.verified);
  const sslActive = hasSslActive(details) || Boolean(verify?.sslActive);
  const hasDnsChange = Boolean(recommended && !verified);
  const failed = Boolean(details?.error || verify?.error);
  const state: VercelConnectionState = !existsOnVercel ? 'not_on_vercel' : failed ? 'error' : verified && sslActive ? 'active' : verified ? 'ssl_pending' : hasDnsChange ? 'dns_change_required' : 'dns_pending';
  const reason = state === 'ssl_pending' ? 'DNS verificado. Aguardando ativação do SSL.' : details?.error?.message || verify?.error?.message || details?.verification?.[0]?.reason || verify?.verification?.[0]?.reason || (state === 'dns_change_required' ? 'A Vercel recomendou atualizar o DNS.' : null);
  return { configured, existsOnVercel, verified, sslActive, status: state === 'active' ? 'active' : failed ? 'error' : 'pending', verificationStatus: verified ? 'verified' : failed ? 'failed' : 'pending', sslStatus: sslActive ? 'active' : failed ? 'failed' : verified ? 'pending' : 'unknown', instruction, connection: buildConnection(state), reason, raw: { details, verify } };
}

export async function syncDomainWithVercel(domain: string): Promise<VercelDomainSyncResult> {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    return { configured: false, existsOnVercel: false, verified: false, sslActive: false, status: 'pending', verificationStatus: 'pending', sslStatus: 'unknown', instruction: getManualDnsInstruction(domain), connection: buildConnection('not_on_vercel'), reason: 'Integração com a Vercel não configurada. O domínio foi salvo, mas precisa ser adicionado manualmente na Vercel.' };
  }
  try {
    let details = await vercelRequest(`/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}`);
    let existsOnVercel = details.ok && !details.data?.error;
    if (!existsOnVercel && (details.status === 404 || details.data?.error?.code === 'not_found')) {
      const added = await vercelRequest(`/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: domain }) });
      existsOnVercel = added.ok || added.data?.error?.code === 'domain_already_in_use';
      if (!existsOnVercel) return { configured: true, existsOnVercel: false, verified: false, sslActive: false, status: 'pending', verificationStatus: 'pending', sslStatus: 'unknown', instruction: getManualDnsInstruction(domain), connection: buildConnection('not_on_vercel'), reason: added.data?.error?.message || 'Domínio não encontrado no projeto da Vercel.', raw: { details: details.data, added: added.data } };
      details = await vercelRequest(`/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}`);
      if (!details.ok) details = added;
    }
    const verify = await vercelRequest(`/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}/verify`, { method: 'POST' });
    return normalizeSync(domain, details.data, verify.data, existsOnVercel, true);
  } catch (error: any) {
    return { configured: true, existsOnVercel: false, verified: false, sslActive: false, status: 'error', verificationStatus: 'failed', sslStatus: 'unknown', instruction: getManualDnsInstruction(domain), connection: buildConnection('error'), reason: error?.message || 'Não foi possível sincronizar o domínio com a Vercel.', raw: error };
  }
}

export async function addDomainToVercel(domain: string) {
  return syncDomainWithVercel(domain);
}

export async function verifyDomainOnVercel(domain: string) {
  return syncDomainWithVercel(domain);
}
