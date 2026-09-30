const DAY_MS = 24 * 60 * 60 * 1_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const FLIP_AI_USAGE_TIME_ZONE = 'America/Sao_Paulo';
export const FLIP_AI_USAGE_PERIODS = [7, 30, 90] as const;
export const FLIP_AI_USAGE_PRESETS = ['today', 'yesterday', '7', '30', '90'] as const;

export type FlipAiUsagePeriod = (typeof FLIP_AI_USAGE_PERIODS)[number];
export type FlipAiUsagePreset = (typeof FLIP_AI_USAGE_PRESETS)[number];

export type FlipAiUsageRange = {
  kind: 'preset' | 'custom';
  preset: FlipAiUsagePreset | null;
  fromDate: string;
  toDate: string;
  from: Date;
  toExclusive: Date;
  label: string;
};

export type FlipAiUsageSearchParams = {
  range?: string | string[];
  from?: string | string[];
  to?: string | string[];
  days?: string | string[];
};

const datePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: FLIP_AI_USAGE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const zonedPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: FLIP_AI_USAGE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseDateOnly(value: string) {
  if (!DATE_ONLY.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function dateOnlyInTimeZone(value: Date) {
  const parts = datePartsFormatter.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addCalendarDays(value: string, amount: number) {
  const parsed = parseDateOnly(value);
  if (!parsed) throw new Error('Invalid date-only value.');
  const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + amount));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

function startOfZonedDate(value: string) {
  const parsed = parseDateOnly(value);
  if (!parsed) throw new Error('Invalid date-only value.');
  const target = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedPartsFormatter.formatToParts(new Date(instant));
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value || 0);
    const observed = Date.UTC(
      get('year'), get('month') - 1, get('day'),
      get('hour'), get('minute'), get('second'),
    );
    instant += target - observed;
  }
  return new Date(instant);
}

function displayDate(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function buildRange(
  kind: FlipAiUsageRange['kind'],
  preset: FlipAiUsagePreset | null,
  fromDate: string,
  toDate: string,
  label: string,
): FlipAiUsageRange {
  return {
    kind,
    preset,
    fromDate,
    toDate,
    from: startOfZonedDate(fromDate),
    toExclusive: startOfZonedDate(addCalendarDays(toDate, 1)),
    label,
  };
}

function presetRange(preset: FlipAiUsagePreset, today: string) {
  if (preset === 'today') {
    return buildRange('preset', preset, today, today, 'Hoje');
  }
  if (preset === 'yesterday') {
    const yesterday = addCalendarDays(today, -1);
    return buildRange('preset', preset, yesterday, yesterday, 'Ontem');
  }
  const days = Number(preset) as FlipAiUsagePeriod;
  const fromDate = addCalendarDays(today, -(days - 1));
  return buildRange('preset', preset, fromDate, today, `Últimos ${days} dias`);
}

export function parseFlipAiUsagePeriod(value: unknown): FlipAiUsagePeriod {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = typeof candidate === 'string' ? Number(candidate) : candidate;
  return FLIP_AI_USAGE_PERIODS.includes(parsed as FlipAiUsagePeriod)
    ? parsed as FlipAiUsagePeriod
    : 30;
}

export function resolveFlipAiUsageRange(
  params: FlipAiUsageSearchParams | undefined,
  now = new Date(),
): FlipAiUsageRange {
  const today = dateOnlyInTimeZone(now);
  const requested = first(params?.range);
  const legacyDays = first(params?.days);
  const preset = FLIP_AI_USAGE_PRESETS.includes(requested as FlipAiUsagePreset)
    ? requested as FlipAiUsagePreset
    : FLIP_AI_USAGE_PERIODS.includes(Number(legacyDays) as FlipAiUsagePeriod)
      ? String(Number(legacyDays)) as FlipAiUsagePreset
      : null;

  if (preset) return presetRange(preset, today);

  if (requested === 'custom') {
    const fromDate = first(params?.from) || '';
    const toDate = first(params?.to) || '';
    const from = parseDateOnly(fromDate);
    const to = parseDateOnly(toDate);
    if (from && to && fromDate <= toDate && toDate <= today) {
      const span = (Date.UTC(to.year, to.month - 1, to.day)
        - Date.UTC(from.year, from.month - 1, from.day)) / DAY_MS;
      if (span <= 365) {
        return buildRange(
          'custom',
          null,
          fromDate,
          toDate,
          fromDate === toDate
            ? displayDate(fromDate)
            : `${displayDate(fromDate)} a ${displayDate(toDate)}`,
        );
      }
    }
  }

  return presetRange('30', today);
}
