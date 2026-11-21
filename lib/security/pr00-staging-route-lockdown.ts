/**
 * Temporary PR00 A2-D diagnostic Preview. NEVER merge this lockdown to main.
 * The exact request allowlist is checked BEFORE cookies, CRM, routing and
 * any integration handler. An unknown/partial Vercel context fails closed.
 */
type Environment = Record<string, string | undefined>;

export const PR00_STAGING_PREVIEW_PROJECT_ID = 'prj_UOvo8lKGiIvp7IuBS4vtL9CnSZIu';
export const PR00_STAGING_IDENTITY_PATH = '/api/internal/pr00/staging-identity';

export type StagingRouteDecision = 'local' | 'allow' | 'deny';

export function pr00StagingRoutePolicy(
  env: Environment,
  request: { method: string; pathname: string },
): StagingRouteDecision {
  // CI/local tests need the ordinary app, but any Vercel runtime (including
  // one with missing VERCEL_ENV) must obey the lockdown.
  const deploymentContext =
    env.VERCEL === '1' ||
    env.VERCEL_ENV !== undefined ||
    env.VERCEL_PROJECT_ID !== undefined ||
    env.VERCEL_GIT_COMMIT_REF !== undefined;

  if (!deploymentContext) return 'local';

  const approvedPreview =
    env.VERCEL_ENV === 'preview' &&
    env.VERCEL_PROJECT_ID === PR00_STAGING_PREVIEW_PROJECT_ID;

  if (!approvedPreview ||
      request.method !== 'GET' ||
      request.pathname !== PR00_STAGING_IDENTITY_PATH) {
    return 'deny';
  }

  // This permits only routing to the endpoint, NOT authentication or DB SQL.
  // The endpoint separately checks token, expiry, exact branch and DB URLs.
  return 'allow';
}
