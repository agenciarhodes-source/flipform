import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async (req, session) => {
  const tenantId = session.tenantId;
  const { searchParams } = new URL(req.url);
  const range = searchParams.get('range') || '30d';
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === 'today' ? 1 : 30;
  const since = new Date(Date.now() - days * 86400000);

  const [total, novos, ganhos, perdidos, emAtendimento, qualificados, leadsBySource, leadsByStage, leadsByAssignee, leadsByDay] = await Promise.all([
    prisma.lead.count({ where: { tenantId } }),
    prisma.lead.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.lead.count({ where: { tenantId, status: 'won' } }),
    prisma.lead.count({ where: { tenantId, status: 'lost' } }),
    prisma.lead.count({ where: { tenantId, status: 'open', stage: { name: { in: ['Primeiro contato', 'Negociação', 'Proposta enviada'] } } } }),
    prisma.lead.count({ where: { tenantId, status: 'open', stage: { name: 'Qualificado' } } }),
    prisma.lead.groupBy({ by: ['source'], where: { tenantId }, _count: true }),
    prisma.lead.groupBy({ by: ['stageId'], where: { tenantId }, _count: true }),
    prisma.lead.groupBy({ by: ['assignedTo'], where: { tenantId, assignedTo: { not: null } }, _count: true }),
    prisma.lead.findMany({ where: { tenantId, createdAt: { gte: since } }, select: { createdAt: true } }),
  ]);

  const stages = await prisma.pipelineStage.findMany({
    where: { pipeline: { tenantId } },
    orderBy: { orderIndex: 'asc' },
  });
  const users = await prisma.user.findMany({
    where: { tenantUsers: { some: { tenantId } } },
    select: { id: true, name: true },
  });

  const stagesData = stages.map((s) => ({
    name: s.name,
    color: s.color,
    count: leadsByStage.find((g) => g.stageId === s.id)?._count || 0,
  }));

  const assigneeData = leadsByAssignee.map((g) => ({
    name: users.find((u) => u.id === g.assignedTo)?.name || '—',
    count: g._count,
  }));

  // por dia
  const byDayMap: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    byDayMap[key] = 0;
  }
  leadsByDay.forEach((l) => {
    const key = l.createdAt.toISOString().slice(0, 10);
    if (byDayMap[key] !== undefined) byDayMap[key]++;
  });
  const byDay = Object.entries(byDayMap).map(([date, count]) => ({
    date: date.slice(5).replace('-', '/'),
    count,
  }));

  const conversionRate = total > 0 ? Math.round((ganhos / total) * 100) : 0;

  return NextResponse.json({
    indicators: {
      total, novos, ganhos, perdidos, emAtendimento, qualificados, conversionRate,
    },
    leadsBySource: leadsBySource.map((g) => ({ source: g.source, count: g._count })),
    leadsByStage: stagesData,
    leadsByAssignee: assigneeData,
    leadsByDay: byDay,
  });
});
