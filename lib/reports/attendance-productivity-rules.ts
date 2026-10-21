/**
 * Pure rules of the human attendance productivity report, so they are easy to test.
 * A response time is counted from the first customer message still waiting for an answer to the
 * next message a person of the team sent in the same conversation. Replies of the AI or sent from
 * the phone also end the wait, but are not credited to anyone.
 */

export type TimelineMessage = {
  conversationId: string;
  direction: string;
  sentByUserId: string | null;
  fromAi: boolean;
  at: Date;
};

export type AttendantSpeed = {
  conversations: number;
  messages: number;
  responses: number;
  medianResponseMs: number | null;
  averageResponseMs: number | null;
  firstResponseMedianMs: number | null;
  within15MinPct: number | null;
};

export const FAST_REPLY_MS = 15 * 60_000;

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** Speed and volume of each person, for the messages they sent inside the period. */
export function attendantSpeed(messages: TimelineMessage[], range: { from: Date; to: Date }) {
  const ordered = [...messages].sort((a, b) => (a.conversationId === b.conversationId
    ? a.at.getTime() - b.at.getTime()
    : a.conversationId < b.conversationId ? -1 : 1));
  const raw = new Map<string, { conversations: Set<string>; messages: number; times: number[]; firstTimes: number[] }>();
  let current = '';
  let waitingSince: Date | null = null;
  let answered = false;
  for (const message of ordered) {
    if (message.conversationId !== current) {
      current = message.conversationId;
      waitingSince = null;
      answered = false;
    }
    if (message.direction === 'inbound') {
      if (!waitingSince) waitingSince = message.at;
      continue;
    }
    if (message.direction !== 'outbound') continue;
    const person = message.sentByUserId && !message.fromAi ? message.sentByUserId : null;
    if (person && message.at >= range.from && message.at <= range.to) {
      const entry = raw.get(person) || { conversations: new Set<string>(), messages: 0, times: [], firstTimes: [] };
      entry.messages += 1;
      entry.conversations.add(message.conversationId);
      if (waitingSince) {
        const elapsed = Math.max(0, message.at.getTime() - waitingSince.getTime());
        entry.times.push(elapsed);
        if (!answered) entry.firstTimes.push(elapsed);
      }
      raw.set(person, entry);
    }
    answered = true;
    waitingSince = null;
  }
  const result = new Map<string, AttendantSpeed>();
  for (const [userId, entry] of raw) {
    const total = entry.times.reduce((sum, value) => sum + value, 0);
    result.set(userId, {
      conversations: entry.conversations.size,
      messages: entry.messages,
      responses: entry.times.length,
      medianResponseMs: median(entry.times),
      averageResponseMs: entry.times.length ? Math.round(total / entry.times.length) : null,
      firstResponseMedianMs: median(entry.firstTimes),
      within15MinPct: entry.times.length
        ? Math.round((entry.times.filter((value) => value <= FAST_REPLY_MS).length / entry.times.length) * 100)
        : null,
    });
  }
  return result;
}

/** "12 min", "2 h 5 min", "3 dias". */
export function formatDuration(ms: number | null) {
  if (ms === null) return '—';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

export type AttendantReview = {
  userId: string;
  name: string;
  score: number;
  strengths: string[];
  improvements: string[];
  example: string | null;
};

/** Reads the AI evaluation, keeping only attendants that were sent and safe values. */
export function parseAttendantReview(raw: unknown, keys: Map<string, { userId: string; name: string }>) {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const text = (item: unknown, max: number) => (typeof item === 'string' ? item.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const list = (items: unknown) => (Array.isArray(items) ? items.map((item) => text(item, 300)).filter(Boolean).slice(0, 3) : []);
  const attendants: AttendantReview[] = [];
  for (const item of Array.isArray(value.attendants) ? value.attendants : []) {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const who = typeof row.key === 'string' ? keys.get(row.key) : undefined;
    if (!who || attendants.some((entry) => entry.userId === who.userId)) continue;
    const score = Number(row.score);
    attendants.push({
      ...who,
      score: Number.isFinite(score) ? Math.min(10, Math.max(0, Math.round(score))) : 0,
      strengths: list(row.strengths),
      improvements: list(row.improvements),
      example: text(row.example, 300) || null,
    });
  }
  return { summary: text(value.summary, 800), attendants };
}
