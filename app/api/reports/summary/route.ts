import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { buildReportContext, validateFiltersBelongToTenant } from '@/lib/reports-helpers';
import { logAudit } from '@/lib/audit';

export const GET = withPermission('REPORTS_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const built = buildReportContext(session, searchParams);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
  const ctx = built.ctx;

  const filterErr = await validateFiltersBelongToTenant(ctx);
  if (filterErr) return NextResponse.json({ error: filterErr }, { status: 400 });

  const where = ctx.leadsWhere;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400000);

  const [
    total,
    ganhos,
    perdidos,
    abertos,
    leadsWithFirstMove,
    leadsConcluded,
    tasksPending,
    tasksOverdue,
    tasksCompletedInRange,
  ] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.count({ where: { ...where, status: 'won' } }),
    prisma.lead.count({ where: { ...where, status: 'lost' } }),
    prisma.lead.count({ where: { ...where, status: 'open' } }),
    // leads que tiveram pelo menos uma mudança de stage após criação
    prisma.lead.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        history: { where: { fromStageId: { not: null } }, orderBy: { createdAt: 'asc' }, take: 1, select: { createdAt: true } },
      },
    }),
    prisma.lead.findMany({
      where: { ...where, status: { in: ['won', 'lost'] } },
      select: { id: true, createdAt: true, updatedAt: true },
    }),
    prisma.task.count({
      where: { tenantId: ctx.tenantId, status: 'pending', lead: { tenantId: ctx.tenantId, AND: [where] } },
    }),
    prisma.task.count({
      where: { tenantId: ctx.tenantId, status: 'pending', dueDate: { lt: now }, lead: { tenantId: ctx.tenantId, AND: [where] } },
    }),
    prisma.task.count({
      where: { tenantId: ctx.tenantId, status: 'completed', completedAt: { gte: ctx.from, lte: ctx.to }, lead: { tenantId: ctx.tenantId, AND: [where] } },
    }),
  ]);

  // Tempo médio até primeiro movimento (ms)
  let totalFirstMoveMs = 0;
  let firstMoveCount = 0;
  for (const l of leadsWithFirstMove) {
    if (l.history.length > 0) {
      totalFirstMoveMs += l.history[0].createdAt.getTime() - l.createdAt.getTime();
      firstMoveCount++;
    }
  }
  const avgFirstMoveHours = firstMoveCount > 0 ? +(totalFirstMoveMs / firstMoveCount / 3600000).toFixed(1) : 0;

  // Tempo médio no funil (criação → conclusão won/lost)
  let totalCycleMs = 0;
  for (const l of leadsConcluded) totalCycleMs += l.updatedAt.getTime() - l.createdAt.getTime();
  const avgCycleHours = leadsConcluded.length > 0 ? +(totalCycleMs / leadsConcluded.length / 3600000).toFixed(1) : 0;

  const conversionRate = total > 0 ? Math.round((ganhos / total) * 100) : 0;

  await logAudit({
    tenantId: ctx.tenantId, userId: ctx.userId,
    entityType: 'report', entityId: 'summary', action: 'reports.viewed',
    metadata: { range: ctx.filters.range, from: ctx.from.toISOString(), to: ctx.to.toISOString() },
  });

  return NextResponse.json({
    range: { from: ctx.from.toISOString(), to: ctx.to.toISOString() },
    totals: {
      total,
      novos: total, // os "novos no período" == leads criados no range
      ganhos,
      perdidos,
      abertos,
      conversionRate,
      avgFirstMoveHours,
      avgCycleHours,
    },
    tasks: {
      pending: tasksPending,
      overdue: tasksOverdue,
      completedInRange: tasksCompletedInRange,
    },
  });
});
