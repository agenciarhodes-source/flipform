import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { buildReportContext, validateFiltersBelongToTenant } from '@/lib/reports-helpers';
import { countByStage, stageEntriesInPeriod } from '@/lib/period-activity';

export const GET = withPermission('REPORTS_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const built = buildReportContext(session, searchParams);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
  const ctx = built.ctx;
  const err = await validateFiltersBelongToTenant(ctx);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const stages = await prisma.pipelineStage.findMany({
    where: { pipeline: { tenantId: ctx.tenantId, ...(ctx.filters.pipelineId ? { id: ctx.filters.pipelineId } : {}) } },
    orderBy: { orderIndex: 'asc' },
    select: { id: true, name: true, color: true, orderIndex: true, pipelineId: true, isArchived: true },
  });
  // Movement of the period: leads that entered each stage in the period, by the day they moved,
  // whatever the day they arrived. The first stage of each funnel also counts the arrivals.
  const { enteredAt: _arrival, ...scope } = ctx.leadsWhere;
  const entered = countByStage(await stageEntriesInPeriod(prisma, {
    leadWhere: scope, stageIds: stages.map((stage) => stage.id), start: ctx.from, end: ctx.to,
  }));
  const arrivals = await prisma.lead.groupBy({ by: ['pipelineId'], where: ctx.leadsWhere, _count: { _all: true } });
  const firstStageByPipeline = new Map<string, string>();
  for (const stage of stages) if (!stage.isArchived && !firstStageByPipeline.has(stage.pipelineId)) firstStageByPipeline.set(stage.pipelineId, stage.id);
  const grouped = stages.map((stage) => {
    const arrived = firstStageByPipeline.get(stage.pipelineId) === stage.id
      ? (arrivals as Array<{ pipelineId: string; _count: { _all: number } }>).find((row) => row.pipelineId === stage.pipelineId)?._count._all || 0
      : 0;
    return { stageId: stage.id, _count: { _all: Math.max(arrived, entered.get(stage.id) || 0) } };
  });
  const data = (stages as Array<{id: string; name: string; color: string; orderIndex: number; [key: string]: unknown}>).map((s) => ({
    stageId: s.id,
    name: s.name,
    color: s.color,
    orderIndex: s.orderIndex,
    pipelineId: s.pipelineId,
    isArchived: s.isArchived,
    count: (grouped as Array<{stageId: string; _count: {_all: number}}>).find((g) => g.stageId === s.id)?._count?._all || 0,
  }));
  return NextResponse.json({ data });
});
