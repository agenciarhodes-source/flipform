import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { buildReportContext, validateFiltersBelongToTenant } from '@/lib/reports-helpers';
import { getFinalStages } from '@/lib/dashboard-metrics';
import { closedInPeriod } from '@/lib/period-activity';

export const GET = withPermission('REPORTS_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const built = buildReportContext(session, searchParams);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
  const ctx = built.ctx;
  const err = await validateFiltersBelongToTenant(ctx);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  // Received by the day they arrived; sales by the day they closed; losses by the day they were marked lost.
  const { enteredAt: _arrival, ...scope } = ctx.leadsWhere;
  const finalStages = await getFinalStages(prisma, ctx.tenantId, ctx.filters.pipelineId || undefined);
  const closedAt = await closedInPeriod(prisma, { leadWhere: scope, finalStageIds: Array.from(finalStages.values()), start: ctx.from, end: ctx.to });
  const [byAgent, wonByAgent, lostByAgent] = await Promise.all([
    prisma.lead.groupBy({ by: ['assignedTo'], where: ctx.leadsWhere, _count: { _all: true } }),
    closedAt.size
      ? prisma.lead.groupBy({ by: ['assignedTo'], where: { id: { in: Array.from(closedAt.keys()) } }, _count: { _all: true } })
      : Promise.resolve([]),
    prisma.lead.groupBy({ by: ['assignedTo'], where: { ...scope, status: 'lost', updatedAt: { gte: ctx.from, lte: ctx.to } }, _count: { _all: true } }),
  ]);

  type GroupRow = { assignedTo: string | null; _count: { _all: number }; [key: string]: unknown };
  type UserRow = { id: string; name: string; email: string };
  const typedByAgent = byAgent as GroupRow[];
  const typedWon = wonByAgent as GroupRow[];
  const typedLost = lostByAgent as GroupRow[];
  // An attendant who only closed old leads in the period still appears.
  for (const row of [...typedWon, ...typedLost]) {
    if (!typedByAgent.some((g) => g.assignedTo === row.assignedTo)) typedByAgent.push({ assignedTo: row.assignedTo, _count: { _all: 0 } });
  }
  const userIds = typedByAgent.map((g) => g.assignedTo).filter(Boolean) as string[];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds }, tenantUsers: { some: { tenantId: ctx.tenantId } } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const wonMap = new Map(typedWon.map((g) => [g.assignedTo, g._count._all]));
  const lostMap = new Map(typedLost.map((g) => [g.assignedTo, g._count._all]));

  const data = typedByAgent.map((g) => {
    const u = g.assignedTo ? (users as UserRow[]).find((x) => x.id === g.assignedTo) : null;
    const total = g._count._all;
    const won = wonMap.get(g.assignedTo) || 0;
    const lost = lostMap.get(g.assignedTo) || 0;
    return {
      userId: g.assignedTo,
      name: u ? u.name : '(sem responsável)',
      email: u?.email || null,
      total,
      won,
      lost,
      conversionRate: total > 0 ? Math.round((won / total) * 100) : 0,
    };
  }).sort((a, b) => (b.total as number) - (a.total as number));
  return NextResponse.json({ data });
});
