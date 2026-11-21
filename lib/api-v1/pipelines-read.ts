import 'server-only';

import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { ApiV1Authorization } from './identity';
import { apiV1Enabled } from './policy';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export type ApiV1PipelineQuery = { limit: number; after: string | null };

/** Reject ambiguous or unbounded queries before accessing the database. */
export function parseApiV1PipelineQuery(rawUrl: string): ApiV1PipelineQuery | null {
  try {
    const params = new URL(rawUrl).searchParams;
    if (Array.from(params.keys()).some(key => key !== 'limit' && key !== 'after')
      || params.getAll('limit').length > 1 || params.getAll('after').length > 1) return null;
    const requestedLimit = params.get('limit');
    const limit = requestedLimit === null ? DEFAULT_LIMIT
      : /^[1-9][0-9]{0,2}$/.test(requestedLimit) ? Number(requestedLimit) : NaN;
    const after = params.get('after');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT
      || (after !== null && !UUID.test(after))) return null;
    return { limit, after: after?.toLowerCase() ?? null };
  } catch { return null; }
}

export type ApiV1PipelineItem = {
  id: string;
  name: string;
  isDefault: boolean;
  stages: Array<{ id: string; name: string; color: string; orderIndex: number }>;
};

export type ApiV1PipelinePage = {
  items: ApiV1PipelineItem[];
  nextCursor: string | null;
};

/**
 * PR02 first useful M2M resource: read-only pipeline/stage metadata.
 * The authenticated credential determines the tenant; callers cannot override
 * it through query, path, body, or headers. No leads, contacts or PII are read.
 */
export async function listApiV1Pipelines(
  authorization: ApiV1Authorization,
  options: ApiV1PipelineQuery,
  db: Pick<PrismaClient, 'pipeline'> = prisma,
): Promise<ApiV1PipelinePage | null> {
  if (!apiV1Enabled(process.env) || !authorization.ok
    || authorization.scope !== 'pipelines.read'
    || !authorization.tenantId || !authorization.integrationId
    || !Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > MAX_LIMIT
    || (options.after !== null && !UUID.test(options.after))) return null;
  try {
    const rows = await db.pipeline.findMany({
      where: {
        tenantId: authorization.tenantId,
        isArchived: false,
        ...(options.after ? { id: { gt: options.after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: options.limit + 1,
      select: {
        id: true, name: true, isDefault: true,
        stages: {
          where: { isArchived: false },
          orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
          select: { id: true, name: true, color: true, orderIndex: true },
        },
      },
    });
    const items: ApiV1PipelineItem[] = rows.slice(0, options.limit);
    return {
      items,
      nextCursor: rows.length > options.limit ? items[items.length - 1]?.id ?? null : null,
    };
  } catch {
    return null; // Fail closed; never reveal database details.
  }
}
