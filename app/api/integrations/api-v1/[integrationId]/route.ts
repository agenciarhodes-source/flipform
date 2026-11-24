import { withAuth } from '@/lib/auth';
import { apiV1Enabled } from '@/lib/api-v1/policy';
import { adminV1Error, adminV1Response, readApiV1Json, validApiV1Uuid, verifyApiV1Owner } from '@/lib/api-v1/admin-http';
import { setApiV1IntegrationState } from '@/lib/api-v1/integration-management';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = withAuth(async (req, session, ctx: { params: { integrationId: string } }) => {
  if (!apiV1Enabled(process.env)) return adminV1Error(404);
  const actor = { userId: session.userId, tenantId: session.tenantId };
  if (!await verifyApiV1Owner(actor, session.role)) return adminV1Error(403);
  const integrationId = ctx.params.integrationId;
  if (!validApiV1Uuid(integrationId)) return adminV1Error(400);
  const body = await readApiV1Json(req);
  if (!body || Object.keys(body).length !== 1
    || (body.status !== 'active' && body.status !== 'disabled')) return adminV1Error(400);
  const integration = await setApiV1IntegrationState(actor, integrationId, body.status);
  if (!integration) return adminV1Error(404);
  return adminV1Response({ integration });
});
