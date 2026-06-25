import { z } from 'zod';
import { Prisma, type LeadStatus, type LeadTemperature, type PrismaClient } from '@prisma/client';

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


export const BRAZIL_STATES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

const STATE_ALIASES = new Map(Object.entries(BRAZIL_STATES).flatMap(([uf, label]) => [[uf, uf], [normalizeText(label), uf]]));

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function normalizeState(value?: string | null) {
  if (!value) return undefined;
  const compact = value.trim().toUpperCase();
  if (BRAZIL_STATES[compact]) return compact;
  return STATE_ALIASES.get(normalizeText(value));
}

function cleanCity(value?: string | null) {
  const city = value?.replace(/\s+/g, ' ').trim();
  return city || undefined;
}

function answerToString(answer: Prisma.JsonValue) {
  if (typeof answer === 'string') return answer;
  if (typeof answer === 'number' || typeof answer === 'boolean') return String(answer);
  if (answer && typeof answer === 'object' && !Array.isArray(answer)) {
    const obj = answer as Record<string, unknown>;
    return [obj.city, obj.cidade, obj.state, obj.estado, obj.uf, obj.value, obj.label].filter(Boolean).join(' - ');
  }
  if (Array.isArray(answer)) return answer.join(' - ');
  return '';
}

export function extractLeadLocation(lead: { answers?: { questionLabel: string; answer: Prisma.JsonValue; field?: { fieldType: string } | null }[] }) {
  let state: string | undefined;
  let city: string | undefined;
  for (const item of lead.answers || []) {
    const label = normalizeText(item.questionLabel || '');
    const fieldType = normalizeText(item.field?.fieldType || '');
    const raw = answerToString(item.answer);
    if (!raw) continue;
    const isGeo = fieldType.includes('city_state') || label.includes('cidade') || label.includes('estado') || label === 'uf' || label.includes(' uf');
    if (!isGeo) continue;
    if (item.answer && typeof item.answer === 'object' && !Array.isArray(item.answer)) {
      const obj = item.answer as Record<string, unknown>;
      city ||= cleanCity(String(obj.city || obj.cidade || ''));
      state ||= normalizeState(String(obj.state || obj.estado || obj.uf || ''));
    }
    const parts = raw.split(/[,\/-]/).map((part) => part.trim()).filter(Boolean);
    for (const part of parts) state ||= normalizeState(part);
    if (!city && (label.includes('cidade') || fieldType.includes('city_state'))) {
      city = cleanCity(parts.find((part) => !normalizeState(part)) || raw.replace(/\b[A-Z]{2}\b/g, '').replace(/[,\/-]/g, ' '));
    }
    if (!state && (label.includes('estado') || label === 'uf')) state = normalizeState(raw);
  }
  return { state, city };
}

const DAY_MS = 86_400_000;

export function formatChartDateBR(value: string | Date): string {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}-${match[2]}`;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value)).replace('/', '-');
}

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
  const selectedCity = cleanCity(rawParams.city);

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

  const [baseLeads, previousLeads, stages, pipelines, filterForms, forms, tasks, sources] = await Promise.all([
    db.lead.findMany({
      where: currentWhere,
      select: {
        id: true, formId: true, pipelineId: true, stageId: true, status: true, temperature: true, source: true, createdAt: true,
        answers: { select: { questionLabel: true, answer: true, field: { select: { fieldType: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.lead.count({ where: previousWhere }),
    pipelineId ? db.pipelineStage.findMany({ where: { pipelineId, isArchived: false }, orderBy: { orderIndex: 'asc' }, select: { id: true, name: true, color: true, orderIndex: true } }) : Promise.resolve([]),
    db.pipeline.findMany({ where: { tenantId, isArchived: false }, select: { id: true, name: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }),
    db.form.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true, pipelineId: true }, orderBy: { name: 'asc' } }),
    db.form.findMany({ where: { tenantId, ...(formId ? { id: formId } : {}), ...(pipelineId ? { pipelineId } : {}) }, select: { id: true, name: true, slug: true, pipelineId: true, initialStageId: true }, orderBy: { createdAt: 'desc' } }),
    Promise.all([
      db.task.count({ where: { tenantId, status: 'pending', ...(agentScope ? { assignedTo: agentScope } : {}) } }),
      db.task.count({ where: { tenantId, status: 'pending', dueDate: { lt: new Date() }, ...(agentScope ? { assignedTo: agentScope } : {}) } }),
      db.task.count({ where: { tenantId, status: 'completed', completedAt: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) }, ...(agentScope ? { assignedTo: agentScope } : {}) } }),
      db.task.count({ where: { tenantId, assignedTo: userId } }),
    ]),
    db.lead.groupBy({ by: ['source'], where: currentWhere, _count: true }),
  ]);

  const leadsWithLocation = baseLeads.map((lead) => ({ ...lead, location: extractLeadLocation(lead) }));
  const filteredLeads = leadsWithLocation.filter((lead) => {
    if (selectedState && lead.location.state !== selectedState) return false;
    if (selectedCity && normalizeText(lead.location.city || '') !== normalizeText(selectedCity)) return false;
    return true;
  });

  const total = filteredLeads.length;
  const newLeads = total;
  const stageOrder = new Map(stages.map((stage, index) => [stage.id, index]));
  const initialStageId = stages[0]?.id || selectedForm?.initialStageId;
  const finalStageId = stages.at(-1)?.id;
  const finalStageCount = finalStageId ? filteredLeads.filter((lead) => lead.stageId === finalStageId).length : filteredLeads.filter((lead) => lead.status === ('won' as LeadStatus)).length;
  const firstStageCount = initialStageId ? filteredLeads.filter((lead) => lead.stageId === initialStageId).length : 0;
  const inProgress = stages.length > 2
    ? filteredLeads.filter((lead) => {
      const index = stageOrder.get(lead.stageId);
      return index != null && index > 0 && index < stages.length - 1;
    }).length
    : Math.max(0, total - firstStageCount - finalStageCount);
  const qualified = filteredLeads.filter((lead) => {
    const index = stageOrder.get(lead.stageId);
    return (index != null && index > 0) || lead.stageId === finalStageId || lead.status === ('won' as LeadStatus) || ['warm', 'hot'].includes(lead.temperature);
  }).length;
  const advancedCount = filteredLeads.filter((lead) => {
    const index = stageOrder.get(lead.stageId);
    return index != null ? index > 0 : lead.stageId !== initialStageId;
  }).length;

  const byDayMap = new Map<string, number>();
  for (let i = 0; i < period.totalDays; i++) {
    const d = new Date(period.startDate.getTime() + i * DAY_MS);
    byDayMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const lead of filteredLeads) {
    const key = lead.createdAt.toISOString().slice(0, 10);
    byDayMap.set(key, (byDayMap.get(key) || 0) + 1);
  }
  let cumulative = 0;
  const elapsedDays = Math.max(1, Math.min(period.totalDays, Math.floor((Math.min(Date.now(), period.endDate.getTime()) - period.startDate.getTime()) / DAY_MS) + 1));
  const avg = newLeads / elapsedDays;
  const leadsByDay = Array.from(byDayMap.entries()).map(([date, count], index) => {
    cumulative += count;
    const projected = period.period === 'today' ? count : index + 1 <= elapsedDays ? cumulative : Math.round(avg * (index + 1));
    return { date, label: formatChartDateBR(date), real: count, projected };
  });

  const tempCounts = new Map<LeadTemperature | 'won', number>([['cold', 0], ['warm', 0], ['hot', 0], ['won', finalStageCount]]);
  for (const lead of filteredLeads) {
    if (lead.stageId === finalStageId) tempCounts.set('hot', (tempCounts.get('hot') || 0) + 1);
    else tempCounts.set(lead.temperature, (tempCounts.get(lead.temperature) || 0) + 1);
  }
  const profileBase = [
    { key: 'cold', label: 'Frios', count: tempCounts.get('cold') || 0, color: '#38BDF8' },
    { key: 'warm', label: 'Mornos', count: tempCounts.get('warm') || 0, color: '#F59E0B' },
    { key: 'hot', label: 'Quentes', count: tempCounts.get('hot') || 0, color: '#EF4444' },
    { key: 'won', label: 'Fechamentos', count: finalStageCount, color: '#10B981' },
  ];
  const profileTotal = profileBase.reduce((sum, row) => sum + row.count, 0);

  const statusProfileBase = [
    { key: 'new', label: 'Novos', count: firstStageCount, color: '#3B82F6' },
    { key: 'progress', label: 'Em atendimento', count: inProgress, color: '#F59E0B' },
    { key: 'qualified', label: 'Qualificados', count: Math.max(0, qualified - finalStageCount), color: '#8B5CF6' },
    { key: 'won', label: 'Fechamentos', count: finalStageCount, color: '#10B981' },
  ];
  const statusProfileTotal = statusProfileBase.reduce((sum, row) => sum + row.count, 0);

  const byStateMap = new Map<string, number>();
  const byCityMap = new Map<string, { state: string; city: string; leads: number }>();
  for (const lead of leadsWithLocation) {
    const state = lead.location.state;
    if (!state) continue;
    byStateMap.set(state, (byStateMap.get(state) || 0) + 1);
    const city = cleanCity(lead.location.city);
    if (city) {
      const key = `${state}:${normalizeText(city)}`;
      const current = byCityMap.get(key) || { state, city, leads: 0 };
      current.leads += 1;
      byCityMap.set(key, current);
    }
  }
  const byState = Array.from(byStateMap.entries()).map(([state, leads]) => ({ state, label: BRAZIL_STATES[state], leads })).sort((a, b) => b.leads - a.leads);
  const byCity = Array.from(byCityMap.values()).filter((row) => !selectedState || row.state === selectedState).sort((a, b) => b.leads - a.leads).slice(0, 12);

  const formLeadCounts = new Map<string, { total: number; final: number; qualified: number; lastLeadAt: Date | null }>();
  for (const lead of filteredLeads) {
    if (!lead.formId) continue;
    const current = formLeadCounts.get(lead.formId) || { total: 0, final: 0, qualified: 0, lastLeadAt: null };
    current.total += 1;
    if (lead.stageId === finalStageId || lead.status === ('won' as LeadStatus)) current.final += 1;
    const index = stageOrder.get(lead.stageId);
    if ((index != null && index > 0) || ['warm', 'hot'].includes(lead.temperature) || lead.status === ('won' as LeadStatus)) current.qualified += 1;
    if (!current.lastLeadAt || lead.createdAt > current.lastLeadAt) current.lastLeadAt = lead.createdAt;
    formLeadCounts.set(lead.formId, current);
  }

  return {
    filters: { period: period.period, startDate: period.startDate.toISOString(), endDate: period.endDate.toISOString(), pipelineId: pipelineId || null, formId: formId || null, state: selectedState || null, city: selectedCity || null, pipelines, forms: filterForms },
    summary: {
      totalLeads: total,
      newLeads,
      inProgress,
      qualified,
      won: finalStageCount,
      lost: filteredLeads.filter((lead) => lead.status === ('lost' as LeadStatus)).length,
      conversionRate: percent(finalStageCount, total),
      advancementRate: percent(advancedCount, total),
      projectionTotal: period.period === 'today' ? null : Math.round(avg * period.totalDays),
      variationVsPrevious: previousLeads > 0 ? percent(newLeads - previousLeads, previousLeads) : null,
    },
    funnel: pipelineId ? { pipelineId, stages: stages.map((stage, index) => {
      const count = filteredLeads.filter((lead) => lead.stageId === stage.id).length;
      const previousCount = index === 0 ? count : filteredLeads.filter((lead) => lead.stageId === stages[index - 1].id).length;
      const advanceRate = index === 0 ? 100 : previousCount > 0 ? percent(count, previousCount) : null;
      const dropOffRate = index === 0 ? 0 : previousCount > 0 ? Math.max(0, percent(previousCount - count, previousCount)) : null;
      return { ...stage, count, percentage: percent(count, total), advanceRate, dropOffRate, isFinal: index === stages.length - 1 };
    }) } : null,
    leadsByDay,
    projection: { total: period.period === 'today' ? null : Math.round(avg * period.totalDays), averagePerDay: Math.round(avg * 10) / 10 },
    profile: {
      temperature: profileBase.map((row) => ({ ...row, percentage: percent(row.count, profileTotal) })),
      status: statusProfileBase.map((row) => ({ ...row, percentage: percent(row.count, statusProfileTotal) })),
    },
    leadProfile: profileBase.map((row) => ({ ...row, percentage: percent(row.count, profileTotal) })),
    geo: { byState, byCity, selectedState: selectedState || null, selectedCity: selectedCity || null },
    formsPerformance: forms.map((form) => {
      const counts = formLeadCounts.get(form.id) || { total: 0, final: 0, qualified: 0, lastLeadAt: null };
      return { id: form.id, name: form.name, slug: form.slug, totalLeads: counts.total, conversionRate: percent(counts.final, counts.total), qualificationRate: percent(counts.qualified, counts.total), lastLeadAt: counts.lastLeadAt?.toISOString() || null, publicUrl: `/f/${form.slug}`, editUrl: `/forms/${form.id}` };
    }),
    sources: sources.map((row) => ({ source: row.source || 'outro', count: row._count, percentage: percent(row._count, baseLeads.length) })).sort((a, b) => b.count - a.count),
    tasks: { pending: tasks[0], overdue: tasks[1], completedToday: tasks[2], mine: tasks[3], recommendations: [tasks[1] > 0 ? `${tasks[1]} tarefas vencidas` : null, (tempCounts.get('hot') || 0) > 0 ? `${tempCounts.get('hot')} leads quentes para priorizar` : null].filter(Boolean) },
  };
}
