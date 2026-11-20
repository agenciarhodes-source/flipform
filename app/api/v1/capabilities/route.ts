import { apiV1Enabled } from '@/lib/api-v1/policy';
import { apiV1Error } from '@/lib/api-v1/errors';
import { authorizeApiV1Request } from '@/lib/api-v1/identity';
import { PrismaApiV1CredentialRepository } from '@/lib/api-v1/prisma-credential-repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * FIRST actual M2M endpoint; intentionally no leads, CRM, ERP, or webhook.
 * Credential-derived tenant only; no tenant override via path/query/body.
 * No in-memory quota fallback.
 */
export async function GET(req: Request): Promise<Response> {
  if (!apiV1Enabled(process.env)) return apiV1Error('api_unavailable', 404);
  const repository = new PrismaApiV1CredentialRepository(undefined, {
    limit: 60, windowMs: 60_000,
  });
  const authorization = await authorizeApiV1Request({
    authorizationHeader: req.headers.get('authorization'),
    scope: 'integrations.read', operation: 'GET /api/v1/capabilities',
  }, repository);
  if (!authorization.ok) return apiV1Error(authorization.code, authorization.status);
  return Response.json({
    version: 'v1', capability: 'integrations.read',
    tenantId: authorization.tenantId, integrationId: authorization.integrationId,
    businessData: false,
  }, { status: 200, headers: {
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  } });
}
