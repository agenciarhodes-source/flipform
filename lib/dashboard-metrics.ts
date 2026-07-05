import { z } from 'zod';
import { Prisma, type LeadStatus, type LeadTemperature, type PrismaClient } from '@prisma/client';
import { formatLeadSource } from './leads';
import { BRAZIL_STATES as BRAZIL_STATE_LIST, getBrazilStateName, normalizeBrazilCity, normalizeBrazilState, normalizeLocationText } from './brazil-locations';

export const dashboardQuerySchema = z.object({
  period: z.enum(['today', '7d', '30d', 'custom']).default('30d'),
  range: z.enum(['today', '7d', '30d']).optional(),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  pipelineId: z.string().uuid().optional(),
  formId: z.string().uuid().optional(),
  state: z.string().trim().min(2).max(30).optional(),
  city: z.string().trim().min(1).max(80).optional(),
}).superRefine((value, ctx) => {
  if (value.period !== 'custom') return;
  if (!value.startDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startDate'], message: 'Data inicial obrigatória para período personalizado.' });
  if (!value.endDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'Data final obrigatória para período personalizado.' });
  if (value.startDate && value.endDate && startOfDay(new Date(value.startDate)) > startOfDay(new Date(value.endDate))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'Data final deve ser maior ou igual à data inicial.' });
  }
});

type DashboardParams = z.infer<typeof dashboardQuerySchema>;
type Db = PrismaClient | Prisma.TransactionClient;


const BRAZIL_STATES: Record<string, string> = Object.fromEntries(BRAZIL_STATE_LIST.map((state) => [state.uf, state.name]));

function normalizeText(value: string) { return normalizeLocationText(value); }

function normalizeState(value?: string | null) { return value ? normalizeBrazilState(value) || undefined : undefined; }

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

export function extractLeadLocation(lead: { state?: string | null; city?: string | null; answers?: { questionLabel: string; answer: Prisma.JsonValue; field?: { fieldType: string } | null }[] }) {
  let state: string | undefined = lead.state ? normalizeState(lead.state) : undefined;
  let city: string | undefined = lead.city ? cleanCity(lead.city) : undefined;
  if (state && city) city = normalizeBrazilCity(state, city) || city;
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
  const totalDays = Math.max(1, Math.floor((endOfDay(endDate).getTime() - startOfDay(startDate).getTime()) / DAY_MS) + 1);
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



type ExecutiveMetricParams = {
  tenantId: string;
  pipelineId?: string;
  formId?: string;
  assignedTo?: string;
  startDate: Date;
  endDate: Date;
};

function metricDelta(current: number, previous: number) {
  return { current, previous, delta: current - previous, deltaPercent: deltaPercent(current, previous) };
}

function isLeadPurchasesMissingError(error: unknown) {
  const err = error as { code?: string; meta?: { table?: string }; message?: string; cause?: { code?: string; message?: string } };
  const message = `${err?.message || ''} ${err?.cause?.message || ''}`.toLowerCase();
  return err?.code === 'P2021'
    || err?.cause?.code === '42P01'
    || err?.meta?.table === 'public.lead_purchases'
    || (message.includes('lead_purchases') && (message.includes('does not exist') || message.includes('não exist') || message.includes('relation') || message.includes('tabela')));
}

function emptyFinancialWindowMetrics() {
  return {
    revenueCents: 0,
    firstPurchaseRevenueCents: 0,
    recurringRevenueCents: 0,
    purchases: 0,
    buyingCustomers: 0,
    recurringCustomers: 0,
    repurchaseRate: 0,
    averageTicketCents: 0,
    averageLtvCents: 0,
  };
}

async function getPurchasesForWindow(db: Db, params: ExecutiveMetricParams) {
  return (db as any).leadPurchase.findMany({
    where: {
      tenantId: params.tenantId,
      purchaseDate: { gte: params.startDate, lte: params.endDate },
      lead: {
        tenantId: params.tenantId,
        ...(params.pipelineId ? { pipelineId: params.pipelineId } : {}),
        ...(params.formId ? { formId: params.formId } : {}),
        ...(params.assignedTo ? { assignedTo: params.assignedTo } : {}),
      },
    },
    include: { lead: { select: { id: true } } },
    orderBy: [{ purchaseDate: 'asc' }, { createdAt: 'asc' }],
  });
}

async function calculateFinancialMetricsForWindow(db: Db, params: ExecutiveMetricParams) {
  let purchases: any[];
  try {
    purchases = await getPurchasesForWindow(db, params);
  } catch (error) {
    if (isLeadPurchasesMissingError(error)) {
      console.error('lead_purchases table missing; returning zero financial dashboard metrics until migration or repair-production-schema runs.', { tenantId: params.tenantId });
      return emptyFinancialWindowMetrics();
    }
    throw error;
  }
  const leadIds: string[] = Array.from(new Set(purchases.map((purchase: any) => String(purchase.leadId))));
  let historical: any[] = [];
  try {
    historical = leadIds.length ? await (db as any).leadPurchase.findMany({ where: { tenantId: params.tenantId, leadId: { in: leadIds } }, orderBy: [{ purchaseDate: 'asc' }, { createdAt: 'asc' }], select: { id: true, leadId: true, amountCents: true, purchaseDate: true, createdAt: true } }) : [];
  } catch (error) {
    if (isLeadPurchasesMissingError(error)) {
      console.error('lead_purchases table missing while loading historical purchases; returning zero financial dashboard metrics until migration or repair-production-schema runs.', { tenantId: params.tenantId });
      return emptyFinancialWindowMetrics();
    }
    throw error;
  }
  const firstPurchaseByLead = new Map<string, string>();
  const totalByLead = new Map<string, number>();
  const countByLead = new Map<string, number>();
  for (const purchase of historical as any[]) {
    if (!firstPurchaseByLead.has(purchase.leadId)) firstPurchaseByLead.set(purchase.leadId, purchase.id);
    totalByLead.set(purchase.leadId, (totalByLead.get(purchase.leadId) || 0) + purchase.amountCents);
    countByLead.set(purchase.leadId, (countByLead.get(purchase.leadId) || 0) + 1);
  }
  const revenueCents = purchases.reduce((sum: number, purchase: any) => sum + purchase.amountCents, 0);
  const firstPurchaseRevenueCents = purchases.filter((purchase: any) => firstPurchaseByLead.get(purchase.leadId) === purchase.id).reduce((sum: number, purchase: any) => sum + purchase.amountCents, 0);
  const recurringRevenueCents = revenueCents - firstPurchaseRevenueCents;
  const recurringCustomers = leadIds.filter((id) => (countByLead.get(id) || 0) > 1).length;
  const historicalLtvCents = leadIds.reduce((sum: number, id: string) => sum + (totalByLead.get(id) || 0), 0);

  const fallbackLeads = await db.lead.findMany({
    where: {
      tenantId: params.tenantId,
      ...(params.pipelineId ? { pipelineId: params.pipelineId } : {}),
      ...(params.formId ? { formId: params.formId } : {}),
      ...(params.assignedTo ? { assignedTo: params.assignedTo } : {}),
      saleValueCents: { gt: 0 },
      saleValueUpdatedAt: { gte: params.startDate, lte: params.endDate },
      purchases: { none: {} },
    },
    select: { id: true, saleValueCents: true },
  });
  const fallbackRevenueCents = fallbackLeads.reduce((sum, lead) => sum + (lead.saleValueCents || 0), 0);

  return {
    revenueCents: revenueCents + fallbackRevenueCents,
    firstPurchaseRevenueCents: firstPurchaseRevenueCents + fallbackRevenueCents,
    recurringRevenueCents,
    purchases: purchases.length + fallbackLeads.length,
    buyingCustomers: new Set([...leadIds, ...fallbackLeads.map((lead) => lead.id)]).size,
    recurringCustomers,
    repurchaseRate: leadIds.length || fallbackLeads.length ? Math.round((recurringCustomers / (leadIds.length + fallbackLeads.length)) * 1000) / 10 : 0,
    averageTicketCents: purchases.length + fallbackLeads.length ? Math.round((revenueCents + fallbackRevenueCents) / (purchases.length + fallbackLeads.length)) : 0,
    averageLtvCents: leadIds.length + fallbackLeads.length ? Math.round((historicalLtvCents + fallbackRevenueCents) / (leadIds.length + fallbackLeads.length)) : 0,
  };
}

export async function calculateFinancialMetrics(db: Db, current: ExecutiveMetricParams, previous: ExecutiveMetricParams) {
  const [cur, prev] = await Promise.all([calculateFinancialMetricsForWindow(db, current), calculateFinancialMetricsForWindow(db, previous)]);
  return {
    revenue: { currentCents: cur.revenueCents, previousCents: prev.revenueCents, deltaPercent: deltaPercent(cur.revenueCents, prev.revenueCents) },
    firstPurchaseRevenue: { currentCents: cur.firstPurchaseRevenueCents, previousCents: prev.firstPurchaseRevenueCents, deltaPercent: deltaPercent(cur.firstPurchaseRevenueCents, prev.firstPurchaseRevenueCents) },
    recurringRevenue: { currentCents: cur.recurringRevenueCents, previousCents: prev.recurringRevenueCents, deltaPercent: deltaPercent(cur.recurringRevenueCents, prev.recurringRevenueCents) },
    purchases: metricDelta(cur.purchases, prev.purchases),
    buyingCustomers: metricDelta(cur.buyingCustomers, prev.buyingCustomers),
    recurringCustomers: metricDelta(cur.recurringCustomers, prev.recurringCustomers),
    repurchaseRate: { current: cur.repurchaseRate, previous: prev.repurchaseRate, deltaPoints: Math.round((cur.repurchaseRate - prev.repurchaseRate) * 10) / 10 },
    averageTicket: { currentCents: cur.averageTicketCents, previousCents: prev.averageTicketCents, deltaPercent: deltaPercent(cur.averageTicketCents, prev.averageTicketCents) },
    averageLtv: { currentCents: cur.averageLtvCents, previousCents: prev.averageLtvCents, deltaPercent: deltaPercent(cur.averageLtvCents, prev.averageLtvCents) },
  };
}

function deltaPercent(current: number, previous: number | null) {
  return previous && previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
}

export async function getFinalStages(db: Db, tenantId: string, pipelineId?: string) {
  const pipelines = pipelineId
    ? await db.pipeline.findMany({ where: { id: pipelineId, tenantId, isArchived: false }, select: { id: true } })
    : await db.pipeline.findMany({ where: { tenantId, isArchived: false }, select: { id: true } });
  if (pipelines.length === 0) return new Map<string, string>();
  const stages = await db.pipelineStage.findMany({
    where: { pipelineId: { in: pipelines.map((pipeline) => pipeline.id) }, isArchived: false },
    orderBy: [{ pipelineId: 'asc' }, { orderIndex: 'desc' }],
    select: { id: true, pipelineId: true, orderIndex: true },
  });
  const finalStages = new Map<string, string>();
  for (const stage of stages) if (!finalStages.has(stage.pipelineId)) finalStages.set(stage.pipelineId, stage.id);
  return finalStages;
}

async function getPipelineStageMetrics(db: Db, tenantId: string, pipelineId?: string) {
  const where = pipelineId
    ? { pipelineId, pipeline: { tenantId, isArchived: false }, isArchived: false }
    : { pipeline: { tenantId, isArchived: false }, isArchived: false };
  const stages = await db.pipelineStage.findMany({
    where,
    orderBy: [{ pipelineId: 'asc' }, { orderIndex: 'asc' }],
    select: { id: true, pipelineId: true, orderIndex: true },
  });
  const initialStagesByPipeline = new Map<string, string>();
  const finalStagesByPipeline = new Map<string, string>();
  const stageOrderByPipeline = new Map<string, Map<string, number>>();
  for (const stage of stages) {
    if (!initialStagesByPipeline.has(stage.pipelineId)) initialStagesByPipeline.set(stage.pipelineId, stage.id);
    finalStagesByPipeline.set(stage.pipelineId, stage.id);
    const order = stageOrderByPipeline.get(stage.pipelineId) || new Map<string, number>();
    order.set(stage.id, order.size);
    stageOrderByPipeline.set(stage.pipelineId, order);
  }
  return { initialStagesByPipeline, finalStagesByPipeline, stageOrderByPipeline };
}

function isClosedLead(lead: { pipelineId: string; stageId: string; status: LeadStatus }, finalStagesByPipeline: Map<string, string>) {
  const finalStageId = finalStagesByPipeline.get(lead.pipelineId);
  return lead.stageId === finalStageId || lead.status === ('won' as LeadStatus);
}

function isQualifiedLead(lead: { pipelineId: string; stageId: string; status: LeadStatus; temperature: LeadTemperature }, finalStagesByPipeline: Map<string, string>, stageOrderByPipeline: Map<string, Map<string, number>>) {
  const index = stageOrderByPipeline.get(lead.pipelineId)?.get(lead.stageId);
  return (index != null && index > 0) || isClosedLead(lead, finalStagesByPipeline) || ['warm', 'hot'].includes(lead.temperature);
}

async function calculateRevenueForWindow(db: Db, params: ExecutiveMetricParams) {
  const finalStages = await getFinalStages(db, params.tenantId, params.pipelineId);
  const finalStageIds = Array.from(finalStages.values());
  if (finalStageIds.length === 0) return 0;

  const closeHistories = await db.leadStageHistory.findMany({
    where: {
      toStageId: { in: finalStageIds },
      createdAt: { gte: params.startDate, lte: params.endDate },
      lead: {
        tenantId: params.tenantId,
        ...(params.pipelineId ? { pipelineId: params.pipelineId } : {}),
        ...(params.formId ? { formId: params.formId } : {}),
        ...(params.assignedTo ? { assignedTo: params.assignedTo } : {}),
      },
    },
    select: { leadId: true },
    distinct: ['leadId'],
  });
  const closedByHistoryIds = closeHistories.map((history) => history.leadId);

  const closedLeadWhere = {
    tenantId: params.tenantId,
    ...(params.pipelineId ? { pipelineId: params.pipelineId } : {}),
    ...(params.formId ? { formId: params.formId } : {}),
    ...(params.assignedTo ? { assignedTo: params.assignedTo } : {}),
    saleValueCents: { gt: 0 },
    OR: [
      ...(closedByHistoryIds.length ? [{ id: { in: closedByHistoryIds } }] : []),
      // Fallback para bases sem histórico confiável: leads já finais cujo valor foi atualizado no período.
      { stageId: { in: finalStageIds }, saleValueUpdatedAt: { gte: params.startDate, lte: params.endDate } } as Prisma.LeadWhereInput,
      { status: 'won' as LeadStatus, saleValueUpdatedAt: { gte: params.startDate, lte: params.endDate } } as Prisma.LeadWhereInput,
    ],
  } as Prisma.LeadWhereInput;

  const result = await (db.lead as any).aggregate({ where: closedLeadWhere, _sum: { saleValueCents: true } });
  return result._sum.saleValueCents || 0;
}

export async function calculateRevenue(db: Db, current: ExecutiveMetricParams, previous: ExecutiveMetricParams) {
  const [currentCents, previousCents] = await Promise.all([calculateRevenueForWindow(db, current), calculateRevenueForWindow(db, previous)]);
  return { currentCents, previousCents, current: currentCents / 100, previous: previousCents / 100, deltaPercent: deltaPercent(currentCents, previousCents), currency: 'BRL', hasRevenueSource: true };
}

export async function calculateOpenDeals(db: Db, params: ExecutiveMetricParams) {
  const finalStages = await getFinalStages(db, params.tenantId, params.pipelineId);
  const finalStageIds = Array.from(finalStages.values());
  const where = leadScope({ tenantId: params.tenantId, pipelineId: params.pipelineId, formId: params.formId, assignedTo: params.assignedTo, startDate: params.startDate, endDate: params.endDate });
  const current = await db.lead.count({ where: { ...where, status: { not: 'lost' as LeadStatus }, ...(finalStageIds.length ? { stageId: { notIn: finalStageIds } } : {}) } });
  return current;
}

export async function calculateAverageTimeToClose(db: Db, params: ExecutiveMetricParams) {
  const finalStages = await getFinalStages(db, params.tenantId, params.pipelineId);
  if (finalStages.size === 0) return null;
  const leads = await db.lead.findMany({
    where: { ...leadScope({ tenantId: params.tenantId, pipelineId: params.pipelineId, formId: params.formId, assignedTo: params.assignedTo, startDate: params.startDate, endDate: params.endDate }) },
    select: { id: true, pipelineId: true, stageId: true, status: true, createdAt: true, updatedAt: true },
  });
  if (leads.length === 0) return null;
  const finalLeadIds = leads.filter((lead) => finalStages.get(lead.pipelineId) === lead.stageId || lead.status === ('won' as LeadStatus)).map((lead) => lead.id);
  if (finalLeadIds.length === 0) return null;
  const histories = await db.leadStageHistory.findMany({
    where: { leadId: { in: finalLeadIds }, toStageId: { in: Array.from(finalStages.values()) } },
    orderBy: { createdAt: 'asc' },
    select: { leadId: true, createdAt: true },
  });
  const firstCloseByLead = new Map<string, Date>();
  for (const history of histories) if (!firstCloseByLead.has(history.leadId)) firstCloseByLead.set(history.leadId, history.createdAt);
  const durations = leads.flatMap((lead) => {
    if (!finalLeadIds.includes(lead.id)) return [];
    const closedAt = firstCloseByLead.get(lead.id) || (finalStages.get(lead.pipelineId) === lead.stageId ? lead.updatedAt : null);
    return closedAt ? [Math.max(0, Math.round((closedAt.getTime() - lead.createdAt.getTime()) / 1000))] : [];
  });
  return durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;
}

async function calculateConversionRate(db: Db, params: ExecutiveMetricParams) {
  const finalStages = await getFinalStages(db, params.tenantId, params.pipelineId);
  const leads = await db.lead.findMany({
    where: leadScope({ tenantId: params.tenantId, pipelineId: params.pipelineId, formId: params.formId, assignedTo: params.assignedTo, startDate: params.startDate, endDate: params.endDate }),
    select: { id: true, pipelineId: true, stageId: true, status: true },
  });
  const won = leads.filter((lead) => finalStages.get(lead.pipelineId) === lead.stageId || lead.status === ('won' as LeadStatus)).length;
  return percent(won, leads.length);
}

export async function getActivityPulseLast24h(db: Db, params: { tenantId: string; assignedTo?: string; now?: Date }) {
  const now = params.now || new Date();
  const start = new Date(now.getTime() - DAY_MS);
  const bucketMs = 30 * 60 * 1000;
  const buckets = Array.from({ length: 48 }, (_, index) => {
    const bucketStart = new Date(start.getTime() + index * bucketMs);
    const bucketEnd = new Date(bucketStart.getTime() + bucketMs);
    return { label: index % 8 === 0 ? `${String(bucketStart.getHours()).padStart(2, '0')}h` : index === 47 ? 'agora' : '', start: bucketStart.toISOString(), end: bucketEnd.toISOString(), count: 0, intensity: 0 };
  });
  const scopedLeadWhere = { tenantId: params.tenantId, ...(params.assignedTo ? { assignedTo: params.assignedTo } : {}) };
  const [auditLogs, leadCreated, leadUpdated, stageHistory, tasks, notes, trackingLogs] = await Promise.all([
    db.auditLog.findMany({ where: { tenantId: params.tenantId, createdAt: { gte: start, lte: now }, ...(params.assignedTo ? { userId: params.assignedTo } : {}) }, select: { createdAt: true } }),
    db.lead.findMany({ where: { ...scopedLeadWhere, createdAt: { gte: start, lte: now } }, select: { createdAt: true } }),
    db.lead.findMany({ where: { ...scopedLeadWhere, updatedAt: { gte: start, lte: now } }, select: { updatedAt: true } }),
    db.leadStageHistory.findMany({ where: { createdAt: { gte: start, lte: now }, lead: scopedLeadWhere }, select: { createdAt: true } }),
    db.task.findMany({ where: { tenantId: params.tenantId, createdAt: { gte: start, lte: now }, ...(params.assignedTo ? { assignedTo: params.assignedTo } : {}) }, select: { createdAt: true } }),
    db.note.findMany({ where: { tenantId: params.tenantId, createdAt: { gte: start, lte: now }, ...(params.assignedTo ? { userId: params.assignedTo } : {}) }, select: { createdAt: true } }),
    (db as any).trackingEventLog?.findMany ? (db as any).trackingEventLog.findMany({ where: { tenantId: params.tenantId, createdAt: { gte: start, lte: now } }, select: { createdAt: true } }) : Promise.resolve([]),
  ]);
  const events = [...auditLogs.map((event) => event.createdAt), ...leadCreated.map((event) => event.createdAt), ...leadUpdated.map((event) => event.updatedAt), ...stageHistory.map((event) => event.createdAt), ...tasks.map((event) => event.createdAt), ...notes.map((event) => event.createdAt), ...trackingLogs.map((event: { createdAt: Date }) => event.createdAt)];
  for (const date of events) {
    const index = Math.floor((date.getTime() - start.getTime()) / bucketMs);
    if (index >= 0 && index < buckets.length) buckets[index].count += 1;
  }
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return { buckets: buckets.map((bucket) => ({ ...bucket, intensity: Math.round((bucket.count / max) * 100) / 100 })), live: true, lastActivityAt: events.sort((a, b) => b.getTime() - a.getTime())[0]?.toISOString() };
}

async function getExecutiveMetrics(db: Db, tenantId: string, assignedTo: string | undefined, params: { pipelineId?: string; formId?: string; period: ReturnType<typeof resolveDashboardPeriod> }) {
  const previous = previousWindow(params.period.startDate, params.period.totalDays);
  const currentArgs = { tenantId, pipelineId: params.pipelineId, formId: params.formId, assignedTo, startDate: params.period.startDate, endDate: params.period.endDate };
  const previousArgs = { ...currentArgs, startDate: previous.start, endDate: previous.end };
  const [activityPulse, financial, openDealsCurrent, openDealsPrevious, avgCloseCurrent, avgClosePrevious, conversionCurrent, conversionPrevious] = await Promise.all([
    getActivityPulseLast24h(db, { tenantId, assignedTo }),
    calculateFinancialMetrics(db, currentArgs, previousArgs),
    calculateOpenDeals(db, currentArgs),
    calculateOpenDeals(db, previousArgs),
    calculateAverageTimeToClose(db, currentArgs),
    calculateAverageTimeToClose(db, previousArgs),
    calculateConversionRate(db, currentArgs),
    calculateConversionRate(db, previousArgs),
  ]);
  return {
    activityPulse,
    revenue: { ...financial.revenue, current: financial.revenue.currentCents / 100, previous: financial.revenue.previousCents / 100, currency: 'BRL' as const, hasRevenueSource: true },
    financial,
    openDeals: { current: openDealsCurrent, previous: openDealsPrevious, delta: openDealsCurrent - openDealsPrevious, deltaPercent: deltaPercent(openDealsCurrent, openDealsPrevious) },
    averageTimeToClose: { currentSeconds: avgCloseCurrent, previousSeconds: avgClosePrevious, deltaSeconds: avgCloseCurrent != null && avgClosePrevious != null ? avgCloseCurrent - avgClosePrevious : null },
    conversionRate: { current: conversionCurrent, previous: conversionPrevious, deltaPoints: conversionPrevious != null ? Math.round((conversionCurrent - conversionPrevious) * 10) / 10 : null },
  };
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
  const executivePromise = getExecutiveMetrics(db, tenantId, agentScope, { pipelineId, formId, period });

  const [executive, baseLeads, previousLeads, stages, pipelines, filterForms, forms, tasks, sources] = await Promise.all([
    executivePromise,
    db.lead.findMany({
      where: currentWhere,
      select: {
        id: true, formId: true, pipelineId: true, stageId: true, status: true, temperature: true, source: true, saleValueCents: true, state: true, city: true, createdAt: true,
        answers: { select: { questionLabel: true, answer: true, field: { select: { fieldType: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.lead.findMany({
      where: previousWhere,
      select: {
        id: true, formId: true, pipelineId: true, stageId: true, status: true, temperature: true, source: true, saleValueCents: true, state: true, city: true, createdAt: true,
        answers: { select: { questionLabel: true, answer: true, field: { select: { fieldType: true } } } },
      },
    }),
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

  const previousLeadsWithLocation = previousLeads.map((lead) => ({ ...lead, location: extractLeadLocation(lead) }));
  const filteredPreviousLeads = previousLeadsWithLocation.filter((lead) => {
    if (selectedState && lead.location.state !== selectedState) return false;
    if (selectedCity && normalizeText(lead.location.city || '') !== normalizeText(selectedCity)) return false;
    return true;
  });

  const total = filteredLeads.length;
  const newLeads = total;
  const stageOrder = new Map(stages.map((stage, index) => [stage.id, index]));
  const initialStageId = stages[0]?.id || selectedForm?.initialStageId;
  const finalStageId = stages.at(-1)?.id;
  const { initialStagesByPipeline, finalStagesByPipeline, stageOrderByPipeline } = await getPipelineStageMetrics(db, tenantId, pipelineId);
  const finalStageCount = filteredLeads.filter((lead) => isClosedLead(lead, finalStagesByPipeline)).length;
  const firstStageCount = filteredLeads.filter((lead) => lead.stageId === (initialStagesByPipeline.get(lead.pipelineId) || initialStageId)).length;
  const inProgress = filteredLeads.filter((lead) => {
    const initial = initialStagesByPipeline.get(lead.pipelineId) || initialStageId;
    const final = finalStagesByPipeline.get(lead.pipelineId);
    return lead.status !== ('lost' as LeadStatus) && lead.stageId !== initial && lead.stageId !== final;
  }).length;
  const qualified = filteredLeads.filter((lead) => isQualifiedLead(lead, finalStagesByPipeline, stageOrderByPipeline)).length;
  const advancedCount = filteredLeads.filter((lead) => {
    const index = stageOrderByPipeline.get(lead.pipelineId)?.get(lead.stageId);
    const initial = initialStagesByPipeline.get(lead.pipelineId) || initialStageId;
    return index != null ? index > 0 : lead.stageId !== initial;
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
    if (isClosedLead(lead, finalStagesByPipeline)) tempCounts.set('hot', (tempCounts.get('hot') || 0) + 1);
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
  const byState = Array.from(byStateMap.entries()).map(([state, leads]) => ({ state, label: getBrazilStateName(state) || BRAZIL_STATES[state], leads })).sort((a, b) => b.leads - a.leads);
  const byCity = Array.from(byCityMap.values()).filter((row) => !selectedState || row.state === selectedState).sort((a, b) => b.leads - a.leads).slice(0, 12);

  const revenueByDayMap = new Map(byDayMap);
  const periodPurchases = await getPurchasesForWindow(db, { tenantId, pipelineId, formId, assignedTo: agentScope, startDate: period.startDate, endDate: period.endDate });
  for (const purchase of periodPurchases as any[]) {
    const key = purchase.purchaseDate.toISOString().slice(0, 10);
    revenueByDayMap.set(key, (revenueByDayMap.get(key) || 0) + purchase.amountCents);
  }
  const revenueByDay = Array.from(revenueByDayMap.entries()).map(([date, amountCents]) => ({ date, label: formatChartDateBR(date), amountCents }));


  const formLeadCounts = new Map<string, { total: number; final: number; qualified: number; lastLeadAt: Date | null }>();
  for (const lead of filteredLeads) {
    if (!lead.formId) continue;
    const current = formLeadCounts.get(lead.formId) || { total: 0, final: 0, qualified: 0, lastLeadAt: null };
    current.total += 1;
    if (isClosedLead(lead, finalStagesByPipeline)) current.final += 1;
    if (isQualifiedLead(lead, finalStagesByPipeline, stageOrderByPipeline)) current.qualified += 1;
    if (!current.lastLeadAt || lead.createdAt > current.lastLeadAt) current.lastLeadAt = lead.createdAt;
    formLeadCounts.set(lead.formId, current);
  }

  return {
    executive,
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
      variationVsPrevious: filteredPreviousLeads.length > 0 ? percent(newLeads - filteredPreviousLeads.length, filteredPreviousLeads.length) : null,
    },
    funnel: pipelineId ? { pipelineId, stages: stages.map((stage, index) => {
      const count = filteredLeads.filter((lead) => lead.stageId === stage.id).length;
      const previousCount = index === 0 ? count : filteredLeads.filter((lead) => lead.stageId === stages[index - 1].id).length;
      const advanceRate = index === 0 ? 100 : previousCount > 0 ? percent(count, previousCount) : null;
      const dropOffRate = index === 0 ? 0 : previousCount > 0 ? Math.max(0, percent(previousCount - count, previousCount)) : null;
      return { ...stage, count, percentage: percent(count, total), advanceRate, dropOffRate, isFinal: index === stages.length - 1 };
    }) } : null,
    leadsByDay,
    revenueByDay,
    financial: executive.financial,
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
    sources: sources.map((row) => ({ source: formatLeadSource(row.source), count: row._count, percentage: percent(row._count, baseLeads.length) })).sort((a, b) => b.count - a.count),
    tasks: { pending: tasks[0], overdue: tasks[1], completedToday: tasks[2], mine: tasks[3], recommendations: [tasks[1] > 0 ? `${tasks[1]} tarefas vencidas` : null, (tempCounts.get('hot') || 0) > 0 ? `${tempCounts.get('hot')} leads quentes para priorizar` : null].filter(Boolean) },
  };
}
