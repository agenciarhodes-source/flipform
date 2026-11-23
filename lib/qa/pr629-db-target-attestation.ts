/**
 * PR629 - fail-closed DB target preflight.
 * This is only for an explicitly enabled, authenticated Vercel preview of PR629.
 * It NEVER logs, returns or persists database URLs, credentials, or data.
 */
export const PR629_QA_DB_HOST = 'ep-round-cake-bct4seb5.c-16.us-east-1.aws.neon.tech';
export const PR629_QA_DB_NAME = 'flipform_staging';
const QA_POOLER_HOST = PR629_QA_DB_HOST.replace('.c-16.', '-pooler.c-16.');

type Env = Readonly<Record<string, string | undefined>>;

export function isPr629DbAttestationAllowed(env: Env, nowMs: number = Date.now()): boolean {
  const expiryMs = Date.parse(env.PR629_DB_ATTESTATION_EXPIRES_AT || '');
  // Fails closed if missing/expired; never allow a diagnostic window over 30 minutes.
  return Number.isFinite(expiryMs)
    && expiryMs > nowMs
    && expiryMs - nowMs <= 30 * 60 * 1000
    && env.VERCEL_ENV === 'preview'
    && env.VERCEL_GIT_COMMIT_REF === 'security/api-v1-homologation-20261121'
    && env.PR629_DB_ATTESTATION_ENABLED === 'true'
    && env.PR629_BLOCK_EXTERNAL_EGRESS === 'true'
    && env.FLIPFORM_API_V1_ENABLED === 'false'
    && env.EMAIL_PROVIDER === 'none'
    && env.MAINTENANCE_GATE === 'disabled';
}

function pgUrlTargetMatches(url: string | undefined, allowedHosts: readonly string[]): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') return false;
    if (!allowedHosts.includes(parsed.hostname.toLowerCase())) return false;
    if (decodeURIComponent(parsed.pathname.slice(1)) !== PR629_QA_DB_NAME) return false;
    if (parsed.port && parsed.port !== '5432') return false;
    return true;
  } catch {
    return false;
  }
}

/** Both configuration targets must match *before* Prisma is allowed to connect. */
export function pr629DbTargetsMatchApprovedQa(env: Env): boolean {
  return pgUrlTargetMatches(env.DATABASE_URL, [PR629_QA_DB_HOST, QA_POOLER_HOST])
    && pgUrlTargetMatches(env.DIRECT_URL, [PR629_QA_DB_HOST]);
}
