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

  const now = new Date();
  // Tarefas dentro do range (createdAt no range OU dueDate no range)
  const taskWhere = {
    tenantId: ctx.tenantId,
    createdAt: { gte: ctx.from, lte: ctx.to },
    ...(ctx.filters.assignedTo ? { assignedTo: ctx.filters.assignedTo } : {}),
  };

  const tasks = await prisma.task.findMany({
    where: taskWhere,
    select: {
      assignedTo: true,
      status: true,
      dueDate: true,
      completedAt: true,
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  // Agrupar por assignedTo
  const byUser = new Map<string, { userId: string | null; name: string; email: string | null; pending: number; overdue: number; completed: number; total: number }>();
  for (const t of tasks) {
    const key = t.assignedTo || 'none';
    if (!byUser.has(key)) {
      byUser.set(key, {
        userId: t.assignedTo,
        name: t.assignee?.name || '(sem responsável)',
        email: t.assignee?.email || null,
        pending: 0,
        overdue: 0,
        completed: 0,
        total: 0,
      });
    }
    const row = byUser.get(key)!;
    row.total++;
    if (t.status === 'pending') {
      row.pending++;
      if (t.dueDate && t.dueDate < now) row.overdue++;
    } else if (t.status === 'completed') {
      row.completed++;
    }
  }
  const data = Array.from(byUser.values()).sort((a, b) => b.total - a.total);
  return NextResponse.json({ data });
});
