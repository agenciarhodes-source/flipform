import { apiV1Enabled } from '@/lib/api-v1/policy';
import { apiV1Error } from '@/lib/api-v1/errors';
import { authorizeApiV1Request } from '@/lib/api-v1/identity';
import { PrismaApiV1CredentialRepository } from '@/lib/api-v1/prisma-credential-repository';
import { readApiV1LeadMetadata, validLeadMetadataDetailRequest } from '@/lib/api-v1/leads-metadata-read';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read only a tenant-owned operational record; no personal contact details. */
export async function GET(
  req: Request, ctx: { params: Promise<{ leadId: string }> },
): Promise<Response> {
  if (!apiV1Enabled(process.env)) return apiV1Error('api_unavailable', 404);
  const { leadId } = await ctx.params;
  if (!validLeadMetadataDetailRequest(req.url, leadId)) return apiV1Error('invalid_request', 400);
  const repository = new PrismaApiV1CredentialRepository(undefined, {
    limit: 60, windowMs: 60_000,
  });
  const authorization = await authorizeApiV1Request({
    authorizationHeader: req.headers.get('authorization'),
    scope: 'leads.metadata.read', operation: 'GET /api/v1/leads/:leadId',
  }, repository);
  if (!authorization.ok) return apiV1Error(authorization.code, authorization.status);
  const result = await readApiV1LeadMetadata(authorization, leadId);
  if (result.kind === 'denied') return apiV1Error('permission_denied', 403);
  if (result.kind === 'not_found') return apiV1Error('resource_not_found', 404);
  if (result.kind === 'unavailable') return apiV1Error('dependency_unavailable', 503);
  return Response.json({ version: 'v1', item: result.item }, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
