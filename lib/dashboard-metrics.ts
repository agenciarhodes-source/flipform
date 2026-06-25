import { z } from 'zod';
import { Prisma, type LeadStatus, type PrismaClient } from '@prisma/client';

export const dashboardQuerySchema = z.object({
  period: z.enum(['today', '7d', '30d', 'custom']).default('30d'),
  range: z.enum(['today', '7d', '30d']).optional(),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  pipelineId: z.string().uuid().optional(),
  formId: z.string().uuid().optional(),
});

type DashboardParams = z.infer<typeof dashboardQuerySchema>;
type Db = PrismaClient | Prisma.TransactionClient;

const DAY_MS = 86_400_000;

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function resolveDashboardPeriod(params: DashboardParams, now = new Date()) {
  const period = params.range || params.period || '30d';
  if (period === 'today') {
    const startDate = startOfDay(now);
    return { period: 'today', startDate, endDate: endOfDay(now), totalDays: 1 };
  }
  if (period === '7d' || period === '30d') {
    const days = period === '7d' ? 7 : 30;
    const endDate = endOfDay(now);
    const startDate = startOfDay(new Date(endDate.getTime() - (days - 1) * DAY_MS));
    return { period, startDate, endDate, totalDays: days };
  }
  const startDate = params.startDate ? startOfDay(new Date(params.startDate)) : startOfDay(new Date(now.getTime() - 29 * DAY_MS));
  const endDate = params.endDate ? endOfDay(new Date(params.endDate)) : endOfDay(now);
  const totalDays = Math.max(1, Math.ceil((endOfDay(endDate).getTime() - startOfDay(startDate).getTime()) / DAY_MS));
  return { period: 'custom', startDate, endDate, totalDays };
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function previousWindow(startDate: Date, totalDays: number) {
  const end = new Date(startDate.getTime() - 1);
  const start = startOfDay(new Date(startDate.getTime() - totalDays * DAY_MS));
  return { start, end };
}

function leadScope(params: { tenantId: string; pipelineId?: string; formId?: string; startDate?: Date; endDate?: Date; assignedTo?: string }) {
  return {
    tenantId: params.tenantId,
    ...(params.pipelineId ? { pipelineId: params.pipelineId } : {}),
    ...(params.formId ? { formId: params.formId } : {}),
    ...(params.assignedTo ? { assignedTo: params.assignedTo } : {}),
    ...(params.startDate && params.endDate ? { createdAt: { gte: params.startDate, lte: params.endDate } } : {}),
  } satisfies Prisma.LeadWhereInput;
}

export async function getDashboardMetrics(db: Db, tenantId: string, userId: string, role: string, rawParams: DashboardParams) {
  const period = resolveDashboardPeriod(rawParams);
  const agentScope = role === 'agent' ? userId : undefined;
  let pipelineId = rawParams.pipelineId;
  const formId = rawParams.formId;

  const selectedForm = formId
    ? await db.form.findFirst({ where: { id: formId, tenantId }, select: { id: true, name: true, slug: true, pipelineId: true, initialStageId: true } })
    : null;
  if (formId && !selectedForm) throw new Error('FORM_NOT_FOUND');
  if (selectedForm && !pipelineId) pipelineId = selectedForm.pipelineId;

  if (pipelineId) {
    const pipeline = await db.pipeline.findFirst({ where: { id: pipelineId, tenantId }, select: { id: true } });
    if (!pipeline) throw new Error('PIPELINE_NOT_FOUND');
  }

  const currentWhere = leadScope({ tenantId, pipelineId, formId, assignedTo: agentScope, startDate: period.startDate, endDate: period.endDate });
  const previous = previousWindow(period.startDate, period.totalDays);
  const previousWhere = leadScope({ tenantId, pipelineId, formId, assignedTo: agentScope, startDate: previous.start, endDate: previous.end });

  const [total, newLeads, previousLeads, won, lost, warmHot, advancedByForm, stages, leadsByStage, leadsByDayRows, profileRows, wonProfile, forms, sources, tasks, pipelines, filterForms] = await Promise.all([
    db.lead.count({ where: currentWhere }),
    db.lead.count({ where: currentWhere }),
    db.lead.count({ where: previousWhere }),
    db.lead.count({ where: { ...currentWhere, status: 'won' as LeadStatus } }),
    db.lead.count({ where: { ...currentWhere, status: 'lost' as LeadStatus } }),
    db.lead.count({ where: { ...currentWhere, temperature: { in: ['warm', 'hot'] } } }),
    db.lead.count({ where: { ...currentWhere, ...(selectedForm ? { stageId: { not: selectedForm.initialStageId } } : {}) } }),
    pipelineId ? db.pipelineStage.findMany({ where: { pipelineId, isArchived: false }, orderBy: { orderIndex: 'asc' }, select: { id: true, name: true, color: true, orderIndex: true } }) : Promise.resolve([]),
    pipelineId ? db.lead.groupBy({ by: ['stageId'], where: currentWhere, _count: true }) : Promise.resolve([]),
    db.lead.findMany({ where: currentWhere, select: { createdAt: true }, orderBy: { createdAt: 'asc' } }),
    db.lead.groupBy({ by: ['temperature'], where: currentWhere, _count: true }),
    db.lead.count({ where: { ...currentWhere, status: 'won' as LeadStatus } }),
    db.form.findMany({ where: { tenantId, ...(formId ? { id: formId } : {}), ...(pipelineId ? { pipelineId } : {}) }, select: { id: true, name: true, slug: true, pipelineId: true, initialStageId: true }, orderBy: { createdAt: 'desc' } }),
    db.lead.groupBy({ by: ['source'], where: currentWhere, _count: true }),
    Promise.all([
      db.task.count({ where: { tenantId, status: 'pending', ...(agentScope ? { assignedTo: agentScope } : {}) } }),
      db.task.count({ where: { tenantId, status: 'pending', dueDate: { lt: new Date() }, ...(agentScope ? { assignedTo: agentScope } : {}) } }),
      db.task.count({ where: { tenantId, status: 'completed', completedAt: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) }, ...(agentScope ? { assignedTo: agentScope } : {}) } }),
      db.task.count({ where: { tenantId, assignedTo: userId } }),
    ]),
    db.pipeline.findMany({ where: { tenantId, isArchived: false }, select: { id: true, name: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }),
    db.form.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true, pipelineId: true }, orderBy: { name: 'asc' } }),
  ]);

  const stageCount = new Map(leadsByStage.map((row) => [row.stageId, row._count]));
  const firstStageCount = stages.length ? stageCount.get(stages[0].id) || 0 : 0;
  const finalStageId = stages.at(-1)?.id;
  const finalStageCount = finalStageId ? stageCount.get(finalStageId) || 0 : won;
  const inProgress = stages.length > 2 ? stages.slice(1, -1).reduce((sum, s) => sum + (stageCount.get(s.id) || 0), 0) : Math.max(0, total - firstStageCount - finalStageCount - lost);
  const advancedCount = stages.length > 1
    ? stages.slice(1).reduce((sum, stage) => sum + (stageCount.get(stage.id) || 0), 0)
    : advancedByForm;

  const byDayMap = new Map<string, number>();
  for (let i = 0; i < period.totalDays; i++) {
    const d = new Date(period.startDate.getTime() + i * DAY_MS);
    byDayMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const lead of leadsByDayRows) {
    const key = lead.createdAt.toISOString().slice(0, 10);
    byDayMap.set(key, (byDayMap.get(key) || 0) + 1);
  }
  let cumulative = 0;
  const elapsedDays = Math.max(1, Math.min(period.totalDays, Math.floor((Math.min(Date.now(), period.endDate.getTime()) - period.startDate.getTime()) / DAY_MS) + 1));
  const avg = newLeads / elapsedDays;
  const leadsByDay = Array.from(byDayMap.entries()).map(([date, count], index) => {
    cumulative += count;
    const projected = period.period === 'today' ? count : index + 1 <= elapsedDays ? cumulative : Math.round(avg * (index + 1));
    return { date, label: date.slice(5).replace('-', '/'), real: count, projected };
  });

  const profileBase = [
    { key: 'cold', label: 'Frios', count: profileRows.find((r) => r.temperature === 'cold')?._count || 0, color: '#38BDF8' },
    { key: 'warm', label: 'Mornos', count: profileRows.find((r) => r.temperature === 'warm')?._count || 0, color: '#F59E0B' },
    { key: 'hot', label: 'Quentes', count: profileRows.find((r) => r.temperature === 'hot')?._count || 0, color: '#EF4444' },
    { key: 'won', label: 'Fechamentos', count: wonProfile, color: '#10B981' },
  ];
  const profileTotal = profileBase.reduce((sum, row) => sum + row.count, 0);

  const formLeadCounts = await db.lead.groupBy({ by: ['formId'], where: { ...currentWhere, formId: { not: null } }, _count: true, _max: { createdAt: true } });
  const finalCounts = finalStageId ? await db.lead.groupBy({ by: ['formId'], where: { ...currentWhere, formId: { not: null }, stageId: finalStageId }, _count: true }) : [];
  const qualifiedCounts = await db.lead.groupBy({ by: ['formId'], where: { ...currentWhere, formId: { not: null }, temperature: { in: ['warm', 'hot'] } }, _count: true });

  return {
    filters: { period: period.period, startDate: period.startDate.toISOString(), endDate: period.endDate.toISOString(), pipelineId: pipelineId || null, formId: formId || null, pipelines, forms: filterForms },
    summary: {
      totalLeads: total,
      newLeads,
      inProgress,
      qualified: warmHot,
      won: finalStageCount || won,
      lost,
      conversionRate: percent(finalStageCount || won, total),
      advancementRate: percent(advancedCount, total),
      projectionTotal: period.period === 'today' ? null : Math.round(avg * period.totalDays),
      variationVsPrevious: previousLeads > 0 ? percent(newLeads - previousLeads, previousLeads) : null,
    },
    funnel: pipelineId ? { pipelineId, stages: stages.map((stage, index) => {
      const count = stageCount.get(stage.id) || 0;
      const previousCount = index === 0 ? count : stageCount.get(stages[index - 1].id) || 0;
      return { ...stage, count, percentage: percent(count, total), advanceRate: index === 0 ? 100 : percent(count, previousCount), dropOffRate: index === 0 ? 0 : percent(previousCount - count, previousCount), isFinal: index === stages.length - 1 };
    }) } : null,
    leadsByDay,
    leadProfile: profileBase.map((row) => ({ ...row, percentage: percent(row.count, profileTotal) })),
    formsPerformance: forms.map((form) => {
      const totalForForm = formLeadCounts.find((row) => row.formId === form.id)?._count || 0;
      const finalForForm = finalCounts.find((row) => row.formId === form.id)?._count || 0;
      const qualifiedForForm = qualifiedCounts.find((row) => row.formId === form.id)?._count || 0;
      return { id: form.id, name: form.name, slug: form.slug, totalLeads: totalForForm, conversionRate: percent(finalForForm, totalForForm), qualificationRate: percent(qualifiedForForm, totalForForm), lastLeadAt: formLeadCounts.find((row) => row.formId === form.id)?._max.createdAt?.toISOString() || null, publicUrl: `/f/${form.slug}`, editUrl: `/forms/${form.id}` };
    }),
    sources: sources.map((row) => ({ source: row.source || 'outro', count: row._count, percentage: percent(row._count, total) })).sort((a, b) => b.count - a.count),
    tasks: { pending: tasks[0], overdue: tasks[1], completedToday: tasks[2], mine: tasks[3], recommendations: [tasks[1] > 0 ? `${tasks[1]} tarefas vencidas` : null, profileBase[2].count > 0 ? `${profileBase[2].count} leads quentes para priorizar` : null].filter(Boolean) },
  };
}
