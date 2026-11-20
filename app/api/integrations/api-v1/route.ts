import { withAuth } from '@/lib/auth';
import { apiV1Enabled } from '@/lib/api-v1/policy';
import { adminV1Error, adminV1Response, readApiV1Json, verifyApiV1Owner } from '@/lib/api-v1/admin-http';
import { createApiV1Integration, listApiV1Integrations } from '@/lib/api-v1/integration-management';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Owner-only tenant-scoped management; not a public M2M resource. */
export const GET = withAuth(async (_req, session) => {
  if (!apiV1Enabled(process.env)) return adminV1Error(404);
  const actor = { userId: session.userId, tenantId: session.tenantId };
  if (!await verifyApiV1Owner(actor)) return adminV1Error(403);
  const integrations = await listApiV1Integrations(actor);
  if (!integrations) return adminV1Error(503);
  return adminV1Response({ integrations });
});

export const POST = withAuth(async (req, session) => {
  if (!apiV1Enabled(process.env)) return adminV1Error(404);
  const actor = { userId: session.userId, tenantId: session.tenantId };
  if (!await verifyApiV1Owner(actor)) return adminV1Error(403);
  const body = await readApiV1Json(req);
  if (!body || Object.keys(body).length !== 1
    || typeof body.displayName !== 'string'
    || body.displayName.trim().length < 2
    || body.displayName.trim().length > 80) return adminV1Error(400);
  const integration = await createApiV1Integration(actor, body.displayName);
  if (!integration) return adminV1Error(409);
  return adminV1Response({ integration }, 201);
});
