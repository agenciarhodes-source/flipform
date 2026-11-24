import { withAuth } from '@/lib/auth';
import { apiV1Enabled } from '@/lib/api-v1/policy';
import { adminV1Error, adminV1Response, isApiV1SameOriginMutation, validApiV1Uuid, verifyApiV1Owner } from '@/lib/api-v1/admin-http';
import { rotateApiV1Key, revokeApiV1Key } from '@/lib/api-v1/credential-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const POST = withAuth(async (req, session,
  ctx: { params: { integrationId: string; credentialId: string } }) => {
  if (!apiV1Enabled(process.env)) return adminV1Error(404);
  const actor = { userId: session.userId, tenantId: session.tenantId };
  if (!await verifyApiV1Owner(actor, session.role)) return adminV1Error(403);
  const { integrationId, credentialId } = ctx.params;
  if (!validApiV1Uuid(integrationId) || !validApiV1Uuid(credentialId)
    || !isApiV1SameOriginMutation(req)) return adminV1Error(400);
  const issued = await rotateApiV1Key(actor, credentialId, {
    integrationId, expiresAt: new Date(Date.now() + MAX_AGE_MS),
  });
  if (!issued) return adminV1Error(409);
  return adminV1Response({ key: issued }, 201);
});

export const DELETE = withAuth(async (req, session,
  ctx: { params: { integrationId: string; credentialId: string } }) => {
  if (!apiV1Enabled(process.env)) return adminV1Error(404);
  const actor = { userId: session.userId, tenantId: session.tenantId };
  if (!await verifyApiV1Owner(actor, session.role)) return adminV1Error(403);
  const { integrationId, credentialId } = ctx.params;
  if (!validApiV1Uuid(integrationId) || !validApiV1Uuid(credentialId)
    || !isApiV1SameOriginMutation(req)) return adminV1Error(400);
  const success = await revokeApiV1Key(actor, credentialId, integrationId);
  if (!success) return adminV1Error(409);
  return adminV1Response({ revoked: true });
});
