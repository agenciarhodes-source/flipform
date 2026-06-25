import { z } from 'zod';
import { Prisma, type LeadStatus, type PrismaClient } from '@prisma/client';

export const dashboardQuerySchema = z.object({
  period: z.enum(['today', '7d', '30d', 'custom']).default('30d'),
  range: z.enum(['today', '7d', '30d']).optional(),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  pipelineId: z.string().uuid().optional(),
  formId: z.string().uuid().optional(),
  state: z.string().trim().min(2).max(30).optional(),
  city: z.string().trim().min(1).max(80).optional(),
});

type DashboardParams = z.infer<typeof dashboardQuerySchema>;
type Db = PrismaClient | Prisma.TransactionClient;


export const BR_STATES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco',
  PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

const STATE_ALIASES = new Map(Object.entries(BR_STATES).flatMap(([uf, name]) => [[uf, uf], [normalizeText(name).toUpperCase(), uf]]));

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function toTitleCase(value: string) {
  return value.toLocaleLowerCase('pt-BR').replace(/(^|\s|[-'])\S/g, (letter) => letter.toLocaleUpperCase('pt-BR'));
}

function normalizeState(value?: string | null) {
  if (!value) return undefined;
  const clean = normalizeText(String(value)).replace(/[^a-zA-Z ]/g, '').trim();
  if (!clean) return undefined;
  return STATE_ALIASES.get(clean.toUpperCase()) || undefined;
}

function parseAnswerValue(answer: unknown): string {
  if (answer == null) return '';
  if (typeof answer === 'string') return answer;
  if (typeof answer === 'number') return String(answer);
  if (Array.isArray(answer)) return answer.map(parseAnswerValue).filter(Boolean).join(', ');
  if (typeof answer === 'object') {
    const obj = answer as Record<string, unknown>;
    return [obj.city, obj.cidade, obj.state, obj.estado, obj.uf, obj.value, obj.label].map(parseAnswerValue).filter(Boolean).join(', ');
  }
  return '';
}

type LeadWithLocationAnswers = { answers?: { questionLabel: string; answer: Prisma.JsonValue; field?: { fieldType: string } | null }[] };

export function extractLeadLocation(lead: LeadWithLocationAnswers): { state?: string; city?: string } {
  let city: string | undefined;
  let state: string | undefined;

  for (const item of lead.answers || []) {
    const label = normalizeText(item.questionLabel || '').toLowerCase();
    const fieldType = item.field?.fieldType || '';
    const value = parseAnswerValue(item.answer);
    if (!value) continue;

    const isGeo = fieldType === 'city_state' || /cidade|estado|uf|localizacao|localização/.test(label);
    if (!isGeo) continue;

    if (!state && (/estado|uf/.test(label) || fieldType === 'city_state')) state = normalizeState(value);
    if (!city && (/cidade|localizacao|localização/.test(label) || fieldType === 'city_state')) {
      const parts = value.split(/[,/-]/).map((part: string) => part.trim()).filter(Boolean);
      const statePart = parts.find((part) => normalizeState(part));
      if (!state && statePart) state = normalizeState(statePart);
      const cityPart = parts.find((part) => !normalizeState(part));
      if (cityPart) city = toTitleCase(cityPart);
    }
  }

  return { state, city };
}

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
  const selectedState = normalizeState(rawParams.state);
  const selectedCity = rawParams.city ? toTitleCase(rawParams.city) : undefined;

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

  const [totalBeforeGeo, newLeadsBeforeGeo, previousLeads, won, lost, warmHot, advancedByForm, stages, leadsByStageBeforeGeo, leadsByDayRowsBeforeGeo, profileRowsBeforeGeo, wonProfile, forms, sourcesBeforeGeo, tasks, pipelines, filterForms, geoLeadRows] = await Promise.all([
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
    db.lead.findMany({ where: currentWhere, select: { id: true, stageId: true, createdAt: true, temperature: true, source: true, formId: true, status: true, answers: { select: { questionLabel: true, answer: true, field: { select: { fieldType: true } } } } } }),
  ]);

  const geoLeadLocations = geoLeadRows.map((lead) => ({ lead, location: extractLeadLocation(lead) }));
  const filteredGeoLeads = geoLeadLocations.filter(({ location }) => (!selectedState || location.state === selectedState) && (!selectedCity || location.city === selectedCity));
  const geoFilteredIds = selectedState || selectedCity ? new Set(filteredGeoLeads.map(({ lead }) => lead.id)) : null;
  const activeGeoRows = geoFilteredIds ? geoLeadRows.filter((lead) => geoFilteredIds.has(lead.id)) : geoLeadRows;
  const total = activeGeoRows.length;
  const newLeads = total;
  const leadsByStage = stages.map((stage) => ({ stageId: stage.id, _count: activeGeoRows.filter((lead) => lead.stageId === stage.id).length }));
  const leadsByDayRows = activeGeoRows.map((lead) => ({ createdAt: lead.createdAt }));
  const profileRows = ['cold', 'warm', 'hot'].map((temperature) => ({ temperature, _count: activeGeoRows.filter((lead) => lead.temperature === temperature).length }));
  const wonActive = activeGeoRows.filter((lead) => lead.status === 'won').length;
  const lostActive = activeGeoRows.filter((lead) => lead.status === 'lost').length;
  const warmHotActive = activeGeoRows.filter((lead) => lead.temperature === 'warm' || lead.temperature === 'hot').length;
  const sources = Array.from(activeGeoRows.reduce((map, lead) => map.set(lead.source, (map.get(lead.source) || 0) + 1), new Map<string | null, number>())).map(([source, _count]) => ({ source, _count }));

  const byStateMap = new Map<string, number>();
  const byCityMap = new Map<string, { state: string; city: string; leads: number }>();
  for (const { location } of geoLeadLocations) {
    if (location.state) byStateMap.set(location.state, (byStateMap.get(location.state) || 0) + 1);
    if (location.state && location.city && (!selectedState || location.state === selectedState)) {
      const key = `${location.state}:${location.city}`;
      const current = byCityMap.get(key) || { state: location.state, city: location.city, leads: 0 };
      current.leads += 1;
      byCityMap.set(key, current);
    }
  }

  const stageCount = new Map(leadsByStage.map((row) => [row.stageId, row._count]));
  const firstStageCount = stages.length ? stageCount.get(stages[0].id) || 0 : 0;
  const finalStageId = stages.at(-1)?.id;
  const finalStageCount = finalStageId ? stageCount.get(finalStageId) || 0 : wonActive;
  const inProgress = stages.length > 2 ? stages.slice(1, -1).reduce((sum, s) => sum + (stageCount.get(s.id) || 0), 0) : Math.max(0, total - firstStageCount - finalStageCount - lostActive);
  const advancedCount = stages.length > 1
    ? stages.slice(1).reduce((sum, stage) => sum + (stageCount.get(stage.id) || 0), 0)
    : warmHotActive;

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

  const baseHot = profileRows.find((r) => r.temperature === 'hot')?._count || 0;
  const profileBase = [
    { key: 'cold', label: 'Frios', count: profileRows.find((r) => r.temperature === 'cold')?._count || 0, color: '#38BDF8' },
    { key: 'warm', label: 'Mornos', count: profileRows.find((r) => r.temperature === 'warm')?._count || 0, color: '#F59E0B' },
    { key: 'hot', label: 'Quentes', count: Math.max(baseHot, finalStageCount), color: '#EF4444' },
    { key: 'won', label: 'Fechamentos', count: finalStageCount || wonProfile, color: '#10B981' },
  ];
  const profileTotal = profileBase.reduce((sum, row) => sum + row.count, 0);

  const formLeadCounts = new Map<string, { count: number; lastLeadAt: Date | null; final: number; qualified: number }>();
  const nonInitialStageIds = new Set(stages.slice(1).map((stage) => stage.id));
  for (const lead of activeGeoRows) {
    if (!lead.formId) continue;
    const current = formLeadCounts.get(lead.formId) || { count: 0, lastLeadAt: null, final: 0, qualified: 0 };
    current.count += 1;
    current.lastLeadAt = !current.lastLeadAt || lead.createdAt > current.lastLeadAt ? lead.createdAt : current.lastLeadAt;
    if (finalStageId && lead.stageId === finalStageId) current.final += 1;
    if (nonInitialStageIds.has(lead.stageId)) current.qualified += 1;
    formLeadCounts.set(lead.formId, current);
  }

  return {
    filters: { period: period.period, startDate: period.startDate.toISOString(), endDate: period.endDate.toISOString(), pipelineId: pipelineId || null, formId: formId || null, state: selectedState || null, city: selectedCity || null, pipelines, forms: filterForms },
    summary: {
      totalLeads: total,
      newLeads,
      inProgress,
      qualified: advancedCount,
      won: finalStageCount || wonActive,
      lost: lostActive,
      conversionRate: percent(finalStageCount || wonActive, total),
      advancementRate: percent(advancedCount, total),
      projectionTotal: period.period === 'today' ? null : Math.round(avg * period.totalDays),
      variationVsPrevious: previousLeads > 0 ? percent(newLeads - previousLeads, previousLeads) : null,
    },
    funnel: pipelineId ? { pipelineId, stages: stages.map((stage, index) => {
      const count = stageCount.get(stage.id) || 0;
      const previousCount = index === 0 ? count : stageCount.get(stages[index - 1].id) || 0;
      return { ...stage, count, percentage: percent(count, total), advanceRate: index === 0 ? 100 : (previousCount > 0 ? percent(count, previousCount) : null), dropOffRate: index === 0 ? 0 : (previousCount > 0 ? Math.max(0, percent(Math.max(0, previousCount - count), previousCount)) : null), isFinal: index === stages.length - 1 };
    }) } : null,
    leadsByDay,
    leadProfile: profileBase.map((row) => ({ ...row, percentage: percent(row.count, profileTotal) })),
    geo: {
      selectedState: selectedState || null,
      selectedCity: selectedCity || null,
      byState: Array.from(byStateMap.entries()).map(([state, leads]) => ({ state, label: BR_STATES[state], leads })).sort((a, b) => b.leads - a.leads),
      byCity: Array.from(byCityMap.values()).sort((a, b) => b.leads - a.leads).slice(0, 25),
    },
    formsPerformance: forms.map((form) => {
      const stats = formLeadCounts.get(form.id) || { count: 0, lastLeadAt: null, final: 0, qualified: 0 };
      return { id: form.id, name: form.name, slug: form.slug, totalLeads: stats.count, conversionRate: percent(stats.final, stats.count), qualificationRate: percent(stats.qualified, stats.count), lastLeadAt: stats.lastLeadAt?.toISOString() || null, publicUrl: `/f/${form.slug}`, editUrl: `/forms/${form.id}` };
    }),
    sources: sources.map((row) => ({ source: row.source || 'outro', count: row._count, percentage: percent(row._count, total) })).sort((a, b) => b.count - a.count),
    tasks: { pending: tasks[0], overdue: tasks[1], completedToday: tasks[2], mine: tasks[3], recommendations: [tasks[1] > 0 ? `${tasks[1]} tarefas vencidas` : null, profileBase[2].count > 0 ? `${profileBase[2].count} leads quentes para priorizar` : null].filter(Boolean) },
  };
}
