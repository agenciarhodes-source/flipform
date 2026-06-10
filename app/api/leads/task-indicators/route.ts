import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth';

// Computa indicadores de tarefas por lead.
// Retorna mapa: { [leadId]: { pending, overdue, dueToday, total } }
export const GET = withAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const leadIdsParam = searchParams.get('leadIds');
  const pipelineId = searchParams.get('pipelineId');

  let leadIds: string[] = [];
  if (leadIdsParam) {
    leadIds = leadIdsParam.split(',').filter(Boolean);
  } else if (pipelineId) {
    const leads = await prisma.lead.findMany({
      where: { tenantId: session.tenantId, pipelineId },
      select: { id: true },
    });
    leadIds = (leads as Array<{ id: string }>).map((l) => l.id);
  } else {
    return NextResponse.json({ indicators: {} });
  }
  if (leadIds.length === 0) return NextResponse.json({ indicators: {} });

  const tasks = await prisma.task.findMany({
    where: {
      tenantId: session.tenantId,
      leadId: { in: leadIds },
    },
    select: { leadId: true, status: true, dueDate: true },
  });

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const indicators: Record<string, { pending: number; overdue: number; dueToday: number; total: number }> = {};
  for (const id of leadIds) indicators[id] = { pending: 0, overdue: 0, dueToday: 0, total: 0 };

  for (const t of tasks) {
    if (!t.leadId) continue;
    const ind = indicators[t.leadId];
    if (!ind) continue;
    ind.total += 1;
    if (t.status === 'pending') {
      ind.pending += 1;
      if (t.dueDate) {
        if (t.dueDate < now) ind.overdue += 1;
        if (t.dueDate >= startOfDay && t.dueDate < endOfDay && t.dueDate >= now) ind.dueToday += 1;
      }
    }
  }

  return NextResponse.json({ indicators });
});
