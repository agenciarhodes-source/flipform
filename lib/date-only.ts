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
