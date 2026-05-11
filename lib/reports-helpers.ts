import { prisma } from '@/lib/prisma';
import { reportFiltersSchema, resolveDateRange, type ReportFilters } from '@/lib/schemas-reports';
import { can } from '@/lib/rbac';

export interface ReportSession {
  tenantId: string;
  userId: string;
  role: string;
}

export interface ReportContext {
  tenantId: string;
  userId: string;
  role: string;
  filters: ReportFilters;
  from: Date;
  to: Date;
  /** WHERE clause base para prisma.lead, já considerando filtros + RBAC */
  leadsWhere: any;
}

/**
 * Parse + valida query params via Zod e devolve um contexto com a cláusula
 * `where` aplicada (tenant + filtros + escopo RBAC).
 *
 * Agent: limita a leads cuja `assignedTo === userId` (a menos que tenha
 * REPORTS_VIEW_ALL, caso em que pode ver tudo).
 */
export function buildReportContext(
  session: ReportSession,
  searchParams: URLSearchParams,
): { ok: true; ctx: ReportContext } | { ok: false; error: string } {
  const raw: any = {
    range: searchParams.get('range') || undefined,
    from: searchParams.get('from') || undefined,
    to: searchParams.get('to') || undefined,
    pipelineId: searchParams.get('pipelineId') || undefined,
    formId: searchParams.get('formId') || undefined,
    source: searchParams.get('source') || undefined,
    assignedTo: searchParams.get('assignedTo') || undefined,
  };
  const parsed = reportFiltersSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message || 'Filtros inválidos.' };
  }
  const filters = parsed.data;
  const { from, to } = resolveDateRange(filters);

  const leadsWhere: any = {
    tenantId: session.tenantId,
    createdAt: { gte: from, lte: to },
  };

  if (filters.pipelineId) leadsWhere.pipelineId = filters.pipelineId;
  if (filters.formId) leadsWhere.formId = filters.formId;
  if (filters.source) leadsWhere.source = filters.source;
  if (filters.assignedTo) leadsWhere.assignedTo = filters.assignedTo;

  // RBAC: agent sem REPORTS_VIEW_ALL só enxerga seus próprios leads
  if (!can(session.role, 'REPORTS_VIEW_ALL')) {
    leadsWhere.assignedTo = session.userId;
  }

  return { ok: true, ctx: { tenantId: session.tenantId, userId: session.userId, role: session.role, filters, from, to, leadsWhere } };
}

/**
 * Verifica se IDs de filtro (pipeline, form, assignedTo) pertencem ao mesmo tenant.
 * Retorna `null` se OK, ou mensagem de erro.
 */
export async function validateFiltersBelongToTenant(ctx: ReportContext): Promise<string | null> {
  const { tenantId, filters } = ctx;
  if (filters.pipelineId) {
    const p = await prisma.pipeline.findFirst({ where: { id: filters.pipelineId, tenantId }, select: { id: true } });
    if (!p) return 'Pipeline inválido para este tenant.';
  }
  if (filters.formId) {
    const f = await prisma.form.findFirst({ where: { id: filters.formId, tenantId }, select: { id: true } });
    if (!f) return 'Formulário inválido para este tenant.';
  }
  if (filters.assignedTo) {
    const tu = await prisma.tenantUser.findFirst({ where: { tenantId, userId: filters.assignedTo }, select: { id: true } });
    if (!tu) return 'Responsável inválido para este tenant.';
  }
  return null;
}

/** Converte um array de objetos em CSV (UTF-8 com BOM para Excel). */
export function toCSV(rows: Record<string, any>[], headers: { key: string; label: string }[]): string {
  const escape = (v: any): string => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n\r;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const headerLine = headers.map((h) => escape(h.label)).join(',');
  const dataLines = rows.map((r) => headers.map((h) => escape(r[h.key])).join(','));
  // BOM para garantir UTF-8 reconhecido por Excel
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}
