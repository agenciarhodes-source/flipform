import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { buildReportContext, validateFiltersBelongToTenant } from '@/lib/reports-helpers';

export const GET = withPermission('REPORTS_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const built = buildReportContext(session, searchParams);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
  const ctx = built.ctx;
  const err = await validateFiltersBelongToTenant(ctx);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const grouped = await prisma.lead.groupBy({
    by: ['stageId'],
    where: ctx.leadsWhere,
    _count: { _all: true },
  });
  const stages = await prisma.pipelineStage.findMany({
    where: { pipeline: { tenantId: ctx.tenantId, ...(ctx.filters.pipelineId ? { id: ctx.filters.pipelineId } : {}) } },
    orderBy: { orderIndex: 'asc' },
    select: { id: true, name: true, color: true, orderIndex: true, pipelineId: true, isArchived: true },
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
