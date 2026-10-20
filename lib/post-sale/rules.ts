/**
 * After-sale messages: when each closed client gets a progress update or the request for a Google
 * review. Pure rules, easy to test.
 */
export const POST_SALE_TIMEZONE = 'America/Sao_Paulo';
export const POST_SALE_HOURS = { start: 9, end: 19 } as const;
export const POST_SALE_MIN_DAYS_BETWEEN_SENDS = 7;
const DAY = 86_400_000;

/** Messages that ask to stop receiving automatic messages. */
export function isOptOutMessage(text: string | null | undefined) {
  const clean = (text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  return ['sair', 'parar', 'pare', 'nao quero', 'nao quero mais', 'cancelar', 'descadastrar', 'stop'].includes(clean);
}

/** Monday to Saturday, from 9h to 19h in Brasília. */
export function isWithinSendingHours(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: POST_SALE_TIMEZONE, weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  return weekday !== 'Sun' && hour >= POST_SALE_HOURS.start && hour < POST_SALE_HOURS.end;
}

export type PostSaleHistory = { lastAnySendAt: Date | null; lastProgressAt: Date | null; reviewSentAt: Date | null };

export function nextPostSaleMessage(input: {
  wonAt: Date;
  now: Date;
  history: PostSaleHistory;
  progress: { enabled: boolean; intervalDays: number };
  review: { enabled: boolean; afterDays: number };
}): 'review' | 'progress' | null {
  const { now, history } = input;
  // Never two automatic messages to the same person in the same week.
  if (history.lastAnySendAt && now.getTime() - history.lastAnySendAt.getTime() < POST_SALE_MIN_DAYS_BETWEEN_SENDS * DAY) return null;
  if (input.review.enabled && !history.reviewSentAt
    && now.getTime() - input.wonAt.getTime() >= input.review.afterDays * DAY) return 'review';
  if (input.progress.enabled) {
    const since = history.lastProgressAt || input.wonAt;
    if (now.getTime() - since.getTime() >= input.progress.intervalDays * DAY) return 'progress';
  }
  return null;
}

/** "name:language", as the settings keep the chosen approved template. */
export function parseTemplateRef(value: string | null | undefined) {
  const match = /^([a-z0-9_]+):([a-z]{2,3}(?:_[A-Z]{2})?)$/.exec(value || '');
  return match ? { name: match[1], language: match[2] } : null;
}
