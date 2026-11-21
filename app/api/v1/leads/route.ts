import { apiV1Enabled } from '@/lib/api-v1/policy';
import { apiV1Error } from '@/lib/api-v1/errors';
import { authorizeApiV1Request } from '@/lib/api-v1/identity';
import { PrismaApiV1CredentialRepository } from '@/lib/api-v1/prisma-credential-repository';
import { listApiV1LeadMetadata, parseLeadsMetadataQuery } from '@/lib/api-v1/leads-metadata-read';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Minimal tenant-bound lead metadata only. No customer contact fields or mutations. */
export async function GET(req: Request): Promise<Response> {
  if (!apiV1Enabled(process.env)) return apiV1Error('api_unavailable', 404);
  const query = parseLeadsMetadataQuery(req.url);
  if (!query) return apiV1Error('invalid_request', 400);

  const repository = new PrismaApiV1CredentialRepository(undefined, {
    limit: 60, windowMs: 60_000,
  });
  const authorization = await authorizeApiV1Request({
    authorizationHeader: req.headers.get('authorization'),
    scope: 'leads.metadata.read', operation: 'GET /api/v1/leads',
  }, repository);
  if (!authorization.ok) return apiV1Error(authorization.code, authorization.status);

  const page = await listApiV1LeadMetadata(authorization, query);
  if (!page) return apiV1Error('dependency_unavailable', 503);
  return Response.json({ version: 'v1', ...page }, { status: 200, headers: {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  } });
}
