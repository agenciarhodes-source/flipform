/** Date-only utilities: dates entered by people are calendar dates, not instants. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function todayDateOnly(now = new Date(), timeZone = 'America/Sao_Paulo'): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch { return now.toISOString().slice(0, 10); }
}

export function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
}

export function isFutureDateOnly(value: string, now = new Date()): boolean {
  return value > todayDateOnly(now);
}

/** Stores an historical calendar date without Brazilian timezone day-shifting. */
export function dateOnlyToDate(value: string): Date {
  if (!isValidDateOnly(value)) throw new Error('Data de entrada inválida.');
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}


/**
 * Returns the calendar-date portion of a stored date without applying the
 * browser/server timezone. Useful for fields such as purchaseDate where the
 * business meaning is a date, not an instant.
 */
export function dateLikeToDateOnly(value: string | Date): string {
  const raw = value instanceof Date ? value.toISOString() : String(value || '');
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct && isValidDateOnly(direct[1])) return direct[1];
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

export function formatDateOnlyBR(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const dateOnly = dateLikeToDateOnly(value);
  if (!dateOnly) return '—';
  const [year, month, day] = dateOnly.split('-');
  return `${day}/${month}/${year}`;
}
