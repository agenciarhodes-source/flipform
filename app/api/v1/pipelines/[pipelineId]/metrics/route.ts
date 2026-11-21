import { apiV1Enabled } from '@/lib/api-v1/policy';
import { apiV1Error } from '@/lib/api-v1/errors';
import { authorizeApiV1Request } from '@/lib/api-v1/identity';
import { PrismaApiV1CredentialRepository } from '@/lib/api-v1/prisma-credential-repository';
import { readApiV1PipelineMetrics, validPipelineMetricsRequest } from '@/lib/api-v1/pipeline-metrics-read';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Aggregate counts only; never reads or exports individual leads. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ pipelineId: string }> },
): Promise<Response> {
  if (!apiV1Enabled(process.env)) return apiV1Error('api_unavailable', 404);
  const { pipelineId } = await ctx.params;
  if (!validPipelineMetricsRequest(req.url, pipelineId)) return apiV1Error('invalid_request', 400);

  const repository = new PrismaApiV1CredentialRepository(undefined, {
    limit: 60, windowMs: 60_000,
  });
  const authorization = await authorizeApiV1Request({
    authorizationHeader: req.headers.get('authorization'),
    scope: 'pipelines.metrics.read', operation: 'GET /api/v1/pipelines/:pipelineId/metrics',
  }, repository);
  if (!authorization.ok) return apiV1Error(authorization.code, authorization.status);

  const result = await readApiV1PipelineMetrics(authorization, pipelineId);
  if (result.kind === 'denied') return apiV1Error('permission_denied', 403);
  if (result.kind === 'not_found') return apiV1Error('resource_not_found', 404);
  if (result.kind === 'unavailable') return apiV1Error('dependency_unavailable', 503);

  return Response.json({
    version: 'v1', pipelineId: result.pipelineId,
    total: result.total, stages: result.stages,
  }, { status: 200, headers: {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  } });
}
