import { z } from 'zod';

const PLATFORM_HOSTS = new Set(['app.flipform.com.br', 'flipform.com.br', 'www.flipform.com.br']);

export const DOMAIN_STATUSES = new Set(['pending', 'active', 'inactive', 'error']);
export const VERIFICATION_STATUSES = new Set(['pending', 'verified', 'failed']);

export function appDomain() {
  return (process.env.NEXT_PUBLIC_APP_DOMAIN || 'app.flipform.com.br').toLowerCase();
}

export function isPlatformHost(host: string | null | undefined) {
  const normalized = normalizeHost(host);
  if (!normalized) return true;
  if (PLATFORM_HOSTS.has(normalized) || normalized === appDomain()) return true;
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  if (normalized.endsWith('.vercel.app')) return true;
  return false;
}

export function normalizeHost(value: string | null | undefined) {
  return String(value || '').split(':')[0].trim().toLowerCase().replace(/\.+$/, '');
}

export function normalizeDomainInput(value: string) {
  let input = String(value || '').trim().toLowerCase();
  input = input.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return input;
}

export function normalizeRoutePath(value: unknown) {
  const raw = String(value || '/').trim().toLowerCase();
  const cleaned = raw.replace(/^https?:\/\/[^/]+/i, '').split('?')[0].split('#')[0].replace(/^\/+|\/+$/g, '');
  return cleaned ? `/${cleaned}` : '/';
}

export function dnsHostLabel(domain: string) {
  return normalizeHost(domain).split('.')[0] || domain;
}

export function dnsInstructions(domain: any) {
  const records = [] as Array<{ type: string; host: string; value: string; note?: string }>;
  if (domain.verificationType && domain.verificationDomain && domain.verificationValue) {
    records.push({ type: domain.verificationType.toUpperCase(), host: domain.verificationDomain, value: domain.verificationValue });
  }
  if (domain.dnsTarget) {
    records.push({ type: 'CNAME', host: dnsHostLabel(domain.domain), value: domain.dnsTarget, note: 'Após configurar o DNS, clique em Verificar agora.' });
  }
  return records;
}

const ipLike = /^(\d{1,3}\.){3}\d{1,3}$/;
const hostRe = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function validateCustomDomain(value: string) {
  const domain = normalizeDomainInput(value);
  if (!domain) return { ok: false as const, domain, error: 'Informe um domínio.' };
  if (domain.includes('/') || domain.includes('?') || domain.includes('#')) return { ok: false as const, domain, error: 'Informe apenas o host, sem caminho ou parâmetros.' };
  if (domain.includes(':')) return { ok: false as const, domain, error: 'Informe apenas o domínio, sem porta.' };
  if (domain === 'localhost' || domain.endsWith('.localhost')) return { ok: false as const, domain, error: 'localhost não pode ser usado como domínio de formulário.' };
  if (ipLike.test(domain)) return { ok: false as const, domain, error: 'Endereços IP não são aceitos.' };
  if (!hostRe.test(domain)) return { ok: false as const, domain, error: 'Domínio inválido.' };
  if (isPlatformHost(domain)) return { ok: false as const, domain, error: 'Domínios da plataforma FlipForm não podem ser cadastrados.' };
  const warning = domain.split('.').length <= 2 ? 'Recomendamos usar um subdomínio como leads.seudominio.com.br para não interferir no seu site principal.' : null;
  return { ok: true as const, domain, warning };
}

export const updateDomainSchema = z.object({
  defaultFormId: z.string().optional().nullable(),
  status: z.string().refine((v) => DOMAIN_STATUSES.has(v), 'Status inválido.').optional(),
});

export const routeSchema = z.object({
  formId: z.string().min(1, 'Formulário obrigatório.'),
  path: z.string().optional().default('/').transform(normalizeRoutePath),
  isDefault: z.boolean().optional().default(false),
});
