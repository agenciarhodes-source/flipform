import 'server-only';

import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { ApiV1Authorization } from './identity';
import { apiV1Enabled } from './policy';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export type LeadsMetadataQuery = {
  limit: number;
  after: string | null;
  pipelineId: string | null;
};
export type LeadMetadata = {
  id: string; formId: string | null; pipelineId: string;
  stageId: string; status: string; createdAt: Date;
};
export type LeadsMetadataPage = { items: LeadMetadata[]; nextCursor: string | null };

/** Only bounded, explicitly known arguments. Tenant is NEVER a request parameter. */
export function parseLeadsMetadataQuery(url: string): LeadsMetadataQuery | null {
  try {
    const params = new URL(url).searchParams;
    if (Array.from(params.keys()).some(key => !['limit', 'after', 'pipelineId'].includes(key))
      || ['limit', 'after', 'pipelineId'].some(key => params.getAll(key).length > 1)) return null;
    const rawLimit = params.get('limit');
    const limit = rawLimit === null ? DEFAULT_LIMIT
      : /^[1-9][0-9]{0,2}$/.test(rawLimit) ? Number(rawLimit) : NaN;
    const after = params.get('after');
    const pipelineId = params.get('pipelineId');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT
      || (after !== null && !UUID.test(after))
      || (pipelineId !== null && !UUID.test(pipelineId))) return null;
    return {
      limit,
      after: after?.toLowerCase() ?? null,
      pipelineId: pipelineId?.toLowerCase() ?? null,
    };
  } catch { return null; }
}

/**
 * Paginated lead identifiers and pipeline placement only. The IDs may be linked
 * to identifiable people downstream, so this is a sensitive gated capability.
 * Never select names, contact details, answers, conversations, notes, tags,
 * attachments, purchases, AI data or arbitrary source strings.
 */
export async function listApiV1LeadMetadata(
  authorization: ApiV1Authorization,
  query: LeadsMetadataQuery,
  db: Pick<PrismaClient, 'lead'> = prisma,
): Promise<LeadsMetadataPage | null> {
  if (!apiV1Enabled(process.env) || !authorization.ok
    || authorization.scope !== 'leads.metadata.read'
    || !authorization.tenantId || !authorization.integrationId
    || !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > MAX_LIMIT
    || (query.after !== null && !UUID.test(query.after))
    || (query.pipelineId !== null && !UUID.test(query.pipelineId))) return null;
  try {
    const rows = await db.lead.findMany({
      where: {
        tenantId: authorization.tenantId,
        ...(query.pipelineId ? { pipelineId: query.pipelineId } : {}),
        ...(query.after ? { id: { gt: query.after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: query.limit + 1,
      select: {
        id: true, formId: true, pipelineId: true, stageId: true,
        status: true, createdAt: true,
      },
    });
    const items: LeadMetadata[] = rows.slice(0, query.limit);
    return {
      items,
      nextCursor: rows.length > query.limit ? items[items.length - 1]?.id ?? null : null,
    };
  } catch {
    return null;
  }
}
