import 'server-only';

export type NormalizedVercelDomain = {
  configured: boolean;
  verified: boolean;
  verificationType?: string | null;
  verificationDomain?: string | null;
  verificationValue?: string | null;
  verificationReason?: string | null;
  dnsTarget?: string | null;
  raw?: any;
};

export function hasVercelDomainConfig() {
  return Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID);
}

function teamQuery() {
  return process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '';
}

async function vercelFetch(path: string, init?: RequestInit) {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID) {
    throw new Error('Integração Vercel não configurada.');
  }
  const res = await fetch(`https://api.vercel.com${path}${teamQuery()}`, {
    ...init,
    headers: { 'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) {
    const msg = data?.error?.message || data?.message || 'Erro na API da Vercel.';
    throw new Error(msg);
  }
  return { status: res.status, data };
}

export function normalizeVercelDomainResponse(response: any): NormalizedVercelDomain {
  const data = response?.data || response || {};
  const verification = Array.isArray(data.verification) ? data.verification[0] : data.verification;
  const verified = Boolean(data.verified || data.configuredBy || data.vercelVerified);
  return {
    configured: Boolean(data.configuredBy || data.name || data.apexName || data.projectId),
    verified,
    verificationType: verification?.type || null,
    verificationDomain: verification?.domain || verification?.name || null,
    verificationValue: verification?.value || null,
    verificationReason: verification?.reason || data.error?.message || null,
    dnsTarget: data?.recommendedCNAME?.[0]?.value || data?.cname || data?.intendedNameservers?.[0] || null,
    raw: data,
  };
}

export async function addDomainToVercel(domain: string) {
  const projectId = process.env.VERCEL_PROJECT_ID;
  const created = await vercelFetch(`/v10/projects/${projectId}/domains`, { method: 'POST', body: JSON.stringify({ name: domain }) });
  if (created.status === 409) return getVercelDomain(domain);
  return normalizeVercelDomainResponse(created.data);
}

export async function getVercelDomain(domain: string) {
  const projectId = process.env.VERCEL_PROJECT_ID;
  const res = await vercelFetch(`/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}`);
  return normalizeVercelDomainResponse(res.data);
}

export async function verifyVercelDomain(domain: string) {
  const projectId = process.env.VERCEL_PROJECT_ID;
  const res = await vercelFetch(`/v9/projects/${projectId}/domains/${encodeURIComponent(domain)}/verify`, { method: 'POST' });
  return normalizeVercelDomainResponse(res.data);
}
