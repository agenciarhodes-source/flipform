export {
  addDomainToVercel,
  syncDomainWithVercel,
  syncVercelProjectDomain,
  verifyDomainOnVercel as verifyVercelDomain,
  type VercelDomainSyncResult,
} from '@/lib/custom-form-domains';

export async function getVercelDomain(domain: string) {
  if (!process.env.VERCEL_TOKEN || !process.env.VERCEL_PROJECT_ID || !process.env.VERCEL_TEAM_ID) {
    return { configured: false, domain, verified: false };
  }
  const teamId = process.env.VERCEL_TEAM_ID;
  const url = `https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}${teamId ? `?teamId=${teamId}` : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` } });
  const data = await res.json().catch(() => ({}));
  return normalizeVercelDomainResponse(data);
}

export function normalizeVercelDomainResponse(response: any) {
  const verification = response?.verification?.[0];
  return {
    configured: true,
    domain: response?.name,
    verified: Boolean(response?.verified),
    sslActive: Boolean(response?.ssl?.status === 'active' || response?.certificate?.status === 'issued'),
    verificationType: verification?.type || null,
    verificationDomain: verification?.domain || null,
    verificationValue: verification?.value || verification?.target || null,
    verificationReason: verification?.reason || response?.error?.message || null,
  };
}
