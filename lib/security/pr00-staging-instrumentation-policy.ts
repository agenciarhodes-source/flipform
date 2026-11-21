/**
 * PR00-only runtime instrumentation policy. This branch must never merge.
 * Prevents telemetry bootstrap in the one-purpose staging diagnostic Preview.
 * Does not block arbitrary outbound sockets/requests outside instrumentation.
 */
type Environment = Record<string, string | undefined>;

export type Pr00InstrumentationDecision = 'local' | 'skip-telemetry' | 'deny';

export function pr00InstrumentationDecision(env: Environment): Pr00InstrumentationDecision {
  // Any recognizable Vercel marker must enter a fail-closed decision, even if
  // VERCEL_ENV is unexpectedly absent. Local and disposable CI stay unchanged.
  const isVercel =
    env.VERCEL === '1' ||
    env.VERCEL_ENV !== undefined ||
    env.VERCEL_PROJECT_ID !== undefined ||
    env.VERCEL_GIT_COMMIT_REF !== undefined;
  if (!isVercel) return 'local';

  const expected =
    env.VERCEL_ENV === 'preview' &&
    env.VERCEL_PROJECT_ID === 'prj_UOvo8lKGiIvp7IuBS4vtL9CnSZIu' &&
    env.NODE_ENV === 'production';
  if (!expected) return 'deny';

  // Vercel's Edge runtime may omit the Git ref; the route itself additionally
  // checks the exact branch and DB identity before any SQL. Node must have ref.
  if (env.NEXT_RUNTIME === 'edge') {
    if (env.VERCEL_GIT_COMMIT_REF !== undefined &&
        env.VERCEL_GIT_COMMIT_REF !== 'security/pr00-a2d-staging-db-attestation-20261118') {
      return 'deny';
    }
    return 'skip-telemetry';
  }

  return env.VERCEL_GIT_COMMIT_REF === 'security/pr00-a2d-staging-db-attestation-20261118'
    ? 'skip-telemetry'
    : 'deny';
}
