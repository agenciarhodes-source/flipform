import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { getTaskScopeForRole } from '@/lib/rbac';

// GET /api/tasks/stats - métricas de tarefas para o dashboard
export const GET = withPermission('TASKS_VIEW', async (_req, session) => {
  const taskScope = getTaskScopeForRole(session);
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const [pending, overdue, completedToday, mine, dueTodayList] = await Promise.all([
    prisma.task.count({ where: { tenantId: session.tenantId, ...taskScope, status: 'pending' } }),
    prisma.task.count({
      where: { tenantId: session.tenantId, ...taskScope, status: 'pending', dueDate: { lt: now } },
    }),
    prisma.task.count({
      where: {
        tenantId: session.tenantId, ...taskScope,
        status: 'completed',
        completedAt: { gte: startOfDay, lt: endOfDay },
      },
    }),
    prisma.task.count({
      where: { tenantId: session.tenantId, ...taskScope, status: 'pending', assignedTo: session.userId },
    }),
    prisma.task.count({
      where: {
        tenantId: session.tenantId, ...taskScope,
        status: 'pending',
        dueDate: { gte: now, lt: endOfDay },
      },
    }),
  ]);

  return NextResponse.json({
    pending,
    overdue,
    completedToday,
    mine,
    dueToday: dueTodayList,
  });
});
