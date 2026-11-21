import { apiV1Enabled } from '@/lib/api-v1/policy';
import { apiV1Error } from '@/lib/api-v1/errors';
import { authorizeApiV1Request } from '@/lib/api-v1/identity';
import { PrismaApiV1CredentialRepository } from '@/lib/api-v1/prisma-credential-repository';
import {
  noFormFieldsQueryParameters, readApiV1FormFields, validApiV1FormId,
} from '@/lib/api-v1/form-fields-read';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tenant-isolated form field DEFINITIONS, not any submitted field values. */
export async function GET(
  req: Request, ctx: { params: Promise<{ formId: string }> },
): Promise<Response> {
  if (!apiV1Enabled(process.env)) return apiV1Error('api_unavailable', 404);
  const { formId } = await ctx.params;
  if (!validApiV1FormId(formId) || !noFormFieldsQueryParameters(req.url)) {
    return apiV1Error('invalid_request', 400);
  }
  const repository = new PrismaApiV1CredentialRepository(undefined, {
    limit: 60, windowMs: 60_000,
  });
  const authorization = await authorizeApiV1Request({
    authorizationHeader: req.headers.get('authorization'),
    scope: 'forms.read', operation: 'GET /api/v1/forms/:formId/fields',
  }, repository);
  if (!authorization.ok) return apiV1Error(authorization.code, authorization.status);
  const result = await readApiV1FormFields(authorization, formId);
  if (result.kind === 'denied') return apiV1Error('permission_denied', 403);
  if (result.kind === 'not_found') return apiV1Error('resource_not_found', 404);
  if (result.kind === 'unavailable') return apiV1Error('dependency_unavailable', 503);
  return Response.json({
    version: 'v1',
    formId: result.formId,
    fields: result.fields,
    truncated: result.truncated,
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
