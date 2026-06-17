import 'server-only';

import { prisma } from '@/lib/prisma';
import { buildPublicFormUrl as buildPublicFormUrlBase } from '@/lib/forms/public-form-url';

export const DEFAULT_APP_DOMAIN = 'app.flipform.com.br';
const RESERVED_DOMAINS = new Set(['flipform.com.br', 'www.flipform.com.br', DEFAULT_APP_DOMAIN]);

export type DnsInstruction = { type: string; name: string; value: string };

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
  return prisma.customFormDomain.findFirst({
    where: { tenantId, isPrimary: true, status: 'active', verificationStatus: 'verified' },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getTenantPublicFormUrl(tenantId: string, slug: string) {
  const primary = await getPrimaryCustomFormDomain(tenantId);
  return buildPublicFormUrl({ slug, primaryDomain: primary?.domain });
}

export function getManualDnsInstruction(domain: string): DnsInstruction {
  return { type: 'CNAME', name: domain.split('.')[0], value: 'cname.vercel-dns.com' };
}

function vercelApi(path: string) {
  const teamId = process.env.VERCEL_TEAM_ID;
  return `https://api.vercel.com${path}${teamId ? `${path.includes('?') ? '&' : '?'}teamId=${teamId}` : ''}`;
}

export async function addDomainToVercel(domain: string) {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) return { configured: false, instruction: getManualDnsInstruction(domain) };
  const res = await fetch(vercelApi(`/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains`), {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: domain }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data?.error?.code !== 'domain_already_in_use') throw new Error(data?.error?.message || 'Erro ao cadastrar domínio na Vercel.');
  const verification = data?.verification?.[0];
  return { configured: true, instruction: verification ? { type: verification.type || 'TXT', name: verification.domain || domain, value: verification.value || '' } : getManualDnsInstruction(domain) };
}

export async function verifyDomainOnVercel(domain: string) {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) return { configured: false, verified: false, instruction: getManualDnsInstruction(domain), reason: 'VERCEL_TOKEN ou VERCEL_PROJECT_ID ausente.' };
  const res = await fetch(vercelApi(`/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}/verify`), { method: 'POST', headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` } });
  const data = await res.json().catch(() => ({}));
  const verified = Boolean(data?.verified || data?.name === domain && !data?.error);
  const verification = data?.verification?.[0];
  return { configured: true, verified, instruction: verification ? { type: verification.type || 'TXT', name: verification.domain || domain, value: verification.value || '' } : getManualDnsInstruction(domain), reason: data?.error?.message || data?.verification?.[0]?.reason || null };
}
