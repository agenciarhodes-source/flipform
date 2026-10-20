import 'server-only';

import { prisma } from '@/lib/prisma';
import { exampleCriterionFor } from './stage-rules';

/** The pipelines the company's Flip AI agents work on, with the criterion of each stage. */
export async function listStageRulePipelines(tenantId: string) {
  const agents = await prisma.flipAiAgent.findMany({
    where: { tenantId, status: { in: ['draft', 'published'] } },
    select: { pipelineId: true },
  });
  const pipelineIds = [...new Set(agents.map((agent) => agent.pipelineId))];
  if (!pipelineIds.length) return [];
  const pipelines = await prisma.pipeline.findMany({
    where: { tenantId, id: { in: pipelineIds }, isArchived: false },
    select: {
      id: true, name: true,
      stages: {
        where: { isArchived: false },
        orderBy: { orderIndex: 'asc' },
        select: { id: true, name: true, orderIndex: true, aiRule: { select: { criterion: true, enabled: true } } },
      },
    },
  });
  return pipelines.map((pipeline) => ({
    id: pipeline.id,
    name: pipeline.name,
    stages: pipeline.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      orderIndex: stage.orderIndex,
      criterion: stage.aiRule?.criterion || '',
      enabled: stage.aiRule?.enabled ?? false,
      example: exampleCriterionFor(stage.name),
    })),
  }));
}
