import 'server-only';

import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { apiV1Enabled } from './policy';
import type { ApiV1Authorization } from './identity';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_STAGES = 200;

export type PipelineMetricsResult =
  | { kind: 'ok'; pipelineId: string; total: number; stages: Array<{ stageId: string; name: string; orderIndex: number; count: number }> }
  | { kind: 'not_found' }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

export function validPipelineMetricsRequest(url: string, pipelineId: string): boolean {
  try {
    return UUID.test(pipelineId) && new URL(url).searchParams.size === 0;
  } catch {
    return false;
  }
}

/**
 * Business metrics only: counts by active stage, no lead rows or PII.
 * Unlike pipelines.read, this endpoint needs dedicated pipelines.metrics.read.
 * The tenant ALWAYS comes from the authenticated M2M credential.
 */
export async function readApiV1PipelineMetrics(
  authorization: ApiV1Authorization,
  pipelineId: string,
  db: Pick<PrismaClient, 'pipeline' | 'lead'> = prisma,
): Promise<PipelineMetricsResult> {
  if (!apiV1Enabled(process.env) || !authorization.ok
    || authorization.scope !== 'pipelines.metrics.read'
    || !authorization.tenantId || !authorization.integrationId
    || !UUID.test(pipelineId)) return { kind: 'denied' };
  try {
    const pipeline = await db.pipeline.findFirst({
      where: { id: pipelineId.toLowerCase(), tenantId: authorization.tenantId, isArchived: false },
      select: {
        id: true,
        stages: {
          where: { isArchived: false },
          orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
          take: MAX_STAGES + 1,
          select: { id: true, name: true, orderIndex: true },
        },
      },
    });
    if (!pipeline) return { kind: 'not_found' };
    if (pipeline.stages.length > MAX_STAGES) return { kind: 'unavailable' };

    const counts = pipeline.stages.length ? await db.lead.groupBy({
      by: ['stageId'],
      where: {
        tenantId: authorization.tenantId,
        pipelineId: pipeline.id,
        stageId: { in: pipeline.stages.map(stage => stage.id) },
      },
      _count: { _all: true },
    }) : [];

    const byStage = new Map(counts.map(item => [item.stageId, item._count._all]));
    const stages = pipeline.stages.map(stage => ({
      stageId: stage.id, name: stage.name, orderIndex: stage.orderIndex,
      count: byStage.get(stage.id) ?? 0,
    }));
    return { kind: 'ok', pipelineId: pipeline.id,
      total: stages.reduce((sum, stage) => sum + stage.count, 0), stages };
  } catch {
    return { kind: 'unavailable' };
  }
}
