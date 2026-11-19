import { timingSafeEqual } from 'node:crypto';

// Non-secret identifiers for the separately provisioned Neon staging project.
export const PR00_STAGING = Object.freeze({
  vercelProjectId: 'prj_UOvo8lKGiIvp7IuBS4vtL9CnSZIu',
  previewBranch: 'security/pr00-a2d-staging-db-attestation-20261118',
  neonHost: 'ep-morning-heart-bcj72cwl.c-16.us-east-1.aws.neon.tech',
  databaseName: 'flipform_staging',
  roleName: 'flipform_staging_owner',
});

type Environment = Record<string, string | undefined>;

function matchesExpectedConnection(raw: string | undefined): boolean {
  if (!raw || raw.length > 8192) return false;

  try {
    const parsed = new URL(raw);
    return ['postgres:', 'postgresql:'].includes(parsed.protocol)
      && parsed.hostname.toLowerCase() === PR00_STAGING.neonHost
      && decodeURIComponent(parsed.pathname) === '/' + PR00_STAGING.databaseName
      && decodeURIComponent(parsed.username) === PR00_STAGING.roleName
      && Boolean(parsed.password)
      && ['require', 'verify-ca', 'verify-full'].includes(parsed.searchParams.get('sslmode') || '');
  } catch {
    return false;
  }
}

/**
 * Fail-closed: can only be activated in the staging Vercel project.
 * Use ONLY a preview deployment of the exact PR00 branch in the staging project.
 * The Neon staging endpoint currently has connection pooling disabled.
 */
export function stagingIdentityGateEnabled(env: Environment): boolean {
  return env.PR00_STAGING_ATTESTATION_ENABLED === 'true'
    && env.VERCEL_ENV === 'preview'
    && env.VERCEL_GIT_COMMIT_REF === PR00_STAGING.previewBranch
    && env.VERCEL_PROJECT_ID === PR00_STAGING.vercelProjectId
    && env.NODE_ENV === 'production'
    && Boolean(env.PR00_STAGING_ATTESTATION_TOKEN)
    && Buffer.byteLength(env.PR00_STAGING_ATTESTATION_TOKEN || '', 'utf8') >= 32
    && matchesExpectedConnection(env.DATABASE_URL)
    && matchesExpectedConnection(env.DIRECT_URL);
}

/** Exact token match without timing leaks or any diagnostic logging. */
export function matchesStagingIdentityToken(
  presented: string | null,
  expected: string | undefined,
): boolean {
  if (!presented || !expected || presented.length > 1024 || expected.length > 1024) return false;
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length < 32 || b.length < 32 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function matchesLiveDatabaseIdentity(row: {
  database_name?: string | null;
  role_name?: string | null;
} | undefined): boolean {
  return row?.database_name === PR00_STAGING.databaseName
    && row?.role_name === PR00_STAGING.roleName;
}
