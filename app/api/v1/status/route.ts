import { apiV1Enabled } from '@/lib/api-v1/policy';
import { apiV1Error } from '@/lib/api-v1/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PR01 first-stage placeholder, deliberately FAIL CLOSED.
 * No backend credential store exists yet. Do not enable the flag until
 * server-side M2M persistence, entitlement checks and rate limits are wired.
 * There is no user data, DB query, outbound request or side effect here.
 */
export async function GET() {
  if (!apiV1Enabled(process.env)) return apiV1Error('api_unavailable', 404);
  return apiV1Error('dependency_unavailable', 503);
}
