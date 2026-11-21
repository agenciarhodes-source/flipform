import { withAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiV1Enabled } from '@/lib/api-v1/policy';
import { adminV1Error, adminV1Response, readApiV1Json, validApiV1Uuid, verifyApiV1Owner } from '@/lib/api-v1/admin-http';
import { belowApiV1KeyLimit, listApiV1Keys } from '@/lib/api-v1/integration-management';
import { issueApiV1Key } from '@/lib/api-v1/credential-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const GET = withAuth(async (_req, session, ctx: { params: { integrationId: string } }) => {
  if (!apiV1Enabled(process.env)) return adminV1Error(404);
  const actor = { userId: session.userId, tenantId: session.tenantId };
  if (!await verifyApiV1Owner(actor)) return adminV1Error(403);
  if (!validApiV1Uuid(ctx.params.integrationId)) return adminV1Error(400);
  const keys = await listApiV1Keys(actor, ctx.params.integrationId);
  if (!keys) return adminV1Error(404);
  return adminV1Response({ keys });
});

export const POST = withAuth(async (req, session, ctx: { params: { integrationId: string } }) => {
  if (!apiV1Enabled(process.env)) return adminV1Error(404);
  const actor = { userId: session.userId, tenantId: session.tenantId };
  if (!await verifyApiV1Owner(actor)) return adminV1Error(403);
  const integrationId = ctx.params.integrationId;
  if (!validApiV1Uuid(integrationId)) return adminV1Error(400);
  const body = await readApiV1Json(req);
  // Exactly one READ-only scope. Event writes and webhooks remain blocked.
  const scope = body && Array.isArray(body.scopes) && body.scopes.length === 1
    && (body.scopes[0] === 'integrations.read' || body.scopes[0] === 'pipelines.read')
      ? body.scopes[0] as 'integrations.read' | 'pipelines.read'
      : null;
  if (!body || Object.keys(body).length !== 1 || !scope) return adminV1Error(400);
  if (!await belowApiV1KeyLimit(actor, integrationId)) return adminV1Error(429);
  const integration = await prisma.apiIntegration.findFirst({
    where: { id: integrationId, tenantId: actor.tenantId, status: 'active' },
    select: { id: true },
  }).catch(() => null);
  if (!integration) return adminV1Error(409);
  const issued = await issueApiV1Key(actor, {
    integrationId, scopes: [scope],
    expiresAt: new Date(Date.now() + MAX_AGE_MS),
  });
  if (!issued) return adminV1Error(503);
  // One-time display. Secret hash only is stored; never include in GET responses.
  return adminV1Response({ key: issued }, 201);
});
