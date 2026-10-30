import { z } from 'zod';

/**
 * "Pergunte ao Flip": the ready-made queries a question can be turned into, and the periods.
 * The AI only picks one of these and its filters; it never reaches the database. Pure, easy to test.
 */
export const ASK_QUERIES = [
  'leads_count', 'closed', 'sources', 'by_attendant', 'sales', 'whatsapp_ai', 'pending', 'by_stage',
  'team_service', 'channels', 'compare', 'unsupported',
] as const;
export type AskQuery = (typeof ASK_QUERIES)[number];

export const ASK_PERIODS = ['today', 'yesterday', 'this_week', 'last_7_days', 'this_month', 'last_month', 'last_30_days', 'this_year', 'custom'] as const;

export const askPlanSchema = z.object({
  query: z.enum(ASK_QUERIES),
  period: z.enum(ASK_PERIODS),
  from: z.string().nullable(),
  to: z.string().nullable(),
  campaign: z.string().nullable(),
  source: z.string().nullable(),
  attendant: z.string().nullable(),
  stage: z.string().nullable(),
});
export type AskPlan = z.infer<typeof askPlanSchema>;

export const ASK_PLAN_FORMAT = {
  type: 'json_schema' as const,
  name: 'flip_ask_plan',
  strict: true as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['query', 'period', 'from', 'to', 'campaign', 'source', 'attendant', 'stage'],
    properties: {
      query: { type: 'string', enum: [...ASK_QUERIES] },
      period: { type: 'string', enum: [...ASK_PERIODS] },
      from: { type: ['string', 'null'], description: 'YYYY-MM-DD, only with period custom' },
      to: { type: ['string', 'null'], description: 'YYYY-MM-DD inclusive, only with period custom' },
      campaign: { type: ['string', 'null'] },
      source: { type: ['string', 'null'] },
      attendant: { type: ['string', 'null'] },
      stage: { type: ['string', 'null'] },
    },
  },
};

const DAY = 86_400_000;

function brasiliaDate(now: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const midnight = (day: string) => new Date(`${day}T00:00:00-03:00`);

/** The start (inclusive) and end (exclusive) of a period, in Brasília, and how to say it. */
export function resolvePeriod(plan: Pick<AskPlan, 'period' | 'from' | 'to'>, now: Date) {
  const today = brasiliaDate(now);
  const [year, month] = today.split('-').map(Number);
  const startToday = midnight(today);
  const tomorrow = new Date(startToday.getTime() + DAY);
  const monthStart = (y: number, m: number) => midnight(`${y}-${String(m).padStart(2, '0')}-01`);
  switch (plan.period) {
    case 'today': return { start: startToday, end: tomorrow, label: 'hoje' };
    case 'yesterday': return { start: new Date(startToday.getTime() - DAY), end: startToday, label: 'ontem' };
    case 'this_week': {
      const weekday = new Date(startToday.getTime() + 3 * 3_600_000).getUTCDay();
      const monday = new Date(startToday.getTime() - ((weekday + 6) % 7) * DAY);
      return { start: monday, end: tomorrow, label: 'esta semana' };
    }
    case 'last_7_days': return { start: new Date(tomorrow.getTime() - 7 * DAY), end: tomorrow, label: 'últimos 7 dias' };
    case 'last_30_days': return { start: new Date(tomorrow.getTime() - 30 * DAY), end: tomorrow, label: 'últimos 30 dias' };
    case 'last_month': {
      const start = month === 1 ? monthStart(year - 1, 12) : monthStart(year, month - 1);
      return { start, end: monthStart(year, month), label: 'mês passado' };
    }
    case 'this_year': return { start: monthStart(year, 1), end: tomorrow, label: `${year}` };
    case 'custom': {
      const valid = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
      const from = valid(plan.from);
      const to = valid(plan.to);
      if (from && to && from <= to) {
        return { start: midnight(from), end: new Date(midnight(to).getTime() + DAY), label: `${from.split('-').reverse().join('/')} a ${to.split('-').reverse().join('/')}` };
      }
      return { start: monthStart(year, month), end: tomorrow, label: 'este mês' };
    }
    case 'this_month':
    default:
      return { start: monthStart(year, month), end: tomorrow, label: 'este mês' };
  }
}

/** The period of the same length right before, to compare ("vs. o período anterior"). */
export function previousPeriod(period: { start: Date; end: Date }) {
  const length = period.end.getTime() - period.start.getTime();
  return { start: new Date(period.start.getTime() - length), end: period.start };
}

/** The period in whole days (1 to 90), for the team report that works by days. */
export function periodDays(period: { start: Date; end: Date }) {
  const days = Math.round((period.end.getTime() - period.start.getTime()) / DAY);
  return Math.max(1, Math.min(90, days));
}

/** Finds the one name the person meant ("mônica" → "Mônica Souza"), or null when unclear. */
export function matchName<T extends { name: string }>(wanted: string | null, options: T[]): T | null {
  if (!wanted?.trim()) return null;
  const clean = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const target = clean(wanted);
  const exact = options.filter((option) => clean(option.name) === target);
  if (exact.length === 1) return exact[0];
  const partial = options.filter((option) => clean(option.name).includes(target) || target.includes(clean(option.name)));
  return partial.length === 1 ? partial[0] : null;
}

export function percent(part: number, total: number) {
  return total > 0 ? `${((part / total) * 100).toFixed(1).replace('.', ',')}%` : '—';
}
