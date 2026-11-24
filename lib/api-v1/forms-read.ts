import 'server-only';

import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { ApiV1Authorization } from './identity';
import { apiV1Enabled } from './policy';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export type ApiV1FormsQuery = { limit: number; after: string | null };
export type ApiV1FormInfo = {
  id: string;
  name: string;
  pipelineId: string;
  initialStageId: string;
  leadSource: string;
};
export type ApiV1FormsPage = { items: ApiV1FormInfo[]; nextCursor: string | null };

/** Never permit tenant overrides, unbounded queries or duplicate params. */
export function parseApiV1FormsQuery(url: string): ApiV1FormsQuery | null {
  try {
    const params = new URL(url).searchParams;
    if (Array.from(params.keys()).some(k => k !== 'limit' && k !== 'after')
      || params.getAll('limit').length > 1 || params.getAll('after').length > 1) return null;
    const requested = params.get('limit');
    const limit = requested === null ? DEFAULT_LIMIT
      : /^[1-9][0-9]{0,2}$/.test(requested) ? Number(requested) : NaN;
    const after = params.get('after');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT
      || (after !== null && !UUID.test(after))) return null;
    return { limit, after: after?.toLowerCase() ?? null };
  } catch { return null; }
}

/**
 * Only active-form routing metadata is selected. No form fields, responses,
 * public slug, contact details or lead/customer data can leave this service.
 */
export async function listApiV1Forms(
  authorization: ApiV1Authorization,
  query: ApiV1FormsQuery,
  db: Pick<PrismaClient, 'form'> = prisma,
): Promise<ApiV1FormsPage | null> {
  if (!apiV1Enabled(process.env) || !authorization.ok
    || authorization.scope !== 'forms.read'
    || !authorization.tenantId || !authorization.integrationId
    || !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > MAX_LIMIT
    || (query.after !== null && !UUID.test(query.after))) return null;
  try {
    const rows = await db.form.findMany({
      where: {
        tenantId: authorization.tenantId,
        isActive: true,
        ...(query.after ? { id: { gt: query.after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: query.limit + 1,
      select: { id: true, name: true, pipelineId: true, initialStageId: true, leadSource: true },
    });
    const items: ApiV1FormInfo[] = rows.slice(0, query.limit);
    return {
      items,
      nextCursor: rows.length > query.limit ? items[items.length - 1]?.id ?? null : null,
    };
  } catch {
    // Fail closed: expose no connection, tenant metadata or SQL diagnostics.
    return null;
  }
}
