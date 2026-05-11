import { z } from 'zod';

/**
 * Schemas para os filtros e respostas dos endpoints de Reports (Fase 7).
 * Todos os endpoints aceitam os mesmos query params para consistência.
 */

export const reportRangeEnum = z.enum(['today', '7d', '30d', '90d', 'custom']);

// Aceita YYYY-MM-DD e valida que é uma data real (e.g. "2025-99-99" → erro).
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(s + 'T00:00:00');
    return !isNaN(d.getTime());
  }, 'Data inválida');

export const reportFiltersSchema = z.object({
  range: reportRangeEnum.optional().default('30d'),
  from: dateString.optional(),
  to: dateString.optional(),
  pipelineId: z.string().uuid().optional(),
  formId: z.string().uuid().optional(),
  source: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
});

export type ReportFilters = z.infer<typeof reportFiltersSchema>;

/**
 * Resolve o range de datas baseado no filtro.
 * - today: hoje (UTC startOfDay → agora).
 * - 7d/30d/90d: últimos N dias.
 * - custom: usa from/to (defaults para 30d se ausentes).
 */
export function resolveDateRange(filters: ReportFilters): { from: Date; to: Date } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (filters.range === 'custom' && (filters.from || filters.to)) {
    const from = filters.from ? new Date(filters.from + 'T00:00:00') : new Date(now.getTime() - 30 * 86400000);
    const to = filters.to ? new Date(filters.to + 'T23:59:59.999') : now;
    return { from, to };
  }

  const days = filters.range === 'today' ? 0 : filters.range === '7d' ? 7 : filters.range === '90d' ? 90 : 30;
  const from = filters.range === 'today' ? startOfToday : new Date(now.getTime() - days * 86400000);
  return { from, to: now };
}
