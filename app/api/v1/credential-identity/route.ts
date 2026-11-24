import { apiV1Enabled } from '@/lib/api-v1/policy';
import { apiV1Error } from '@/lib/api-v1/errors';
import { authorizeApiV1Request } from '@/lib/api-v1/identity';
import { identityResponse, parseKeyIdentityScope } from '@/lib/api-v1/credential-identity';
import { PrismaApiV1CredentialRepository } from '@/lib/api-v1/prisma-credential-repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Fail-closed identity proof for ONE read-only scope; no CRM records or PII. */
export async function GET(req: Request): Promise<Response> {
  if (!apiV1Enabled(process.env)) return apiV1Error('api_unavailable', 404);
  const scope = parseKeyIdentityScope(req.url);
  if (!scope) return apiV1Error('invalid_request', 400);
  const repository = new PrismaApiV1CredentialRepository(undefined, {
    limit: 60, windowMs: 60_000,
  });
  const authorized = await authorizeApiV1Request({
    authorizationHeader: req.headers.get('authorization'),
    scope,
    operation: 'GET /api/v1/credential-identity',
  }, repository);
  if (!authorized.ok) return apiV1Error(authorized.code, authorized.status);
  return Response.json(identityResponse(authorized.tenantId, authorized.integrationId, authorized.scope), {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
