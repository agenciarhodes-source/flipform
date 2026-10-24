/**
 * Supervision of the AI on WhatsApp: which conversations to review and how to count the problems.
 * Pure rules, easy to test.
 */
export const REVIEW_QUIET_HOURS = 2;
export const REVIEWS_PER_OPEN = 10;
/** The daily review runs early in the morning (Brasília), so the results are ready at the start of the day. */
export const DAILY_REVIEW_HOURS = [6, 7] as const;
/** Per company, per run of the scheduler (every minute), so each run stays short. */
export const DAILY_REVIEWS_PER_RUN = 2;
/** Problems that need a person even when the score is not low: sensitive in any business. */
export const ALERT_ISSUES = ['made_up', 'should_handoff'] as const;

export const REVIEW_ISSUES = {
  wrong_answer: '❌ Resposta errada ou fora da base',
  made_up: '🌀 Inventou informação',
  stuck: '🔁 Travou ou repetiu',
  should_handoff: '🙋 Devia ter passado para uma pessoa',
  documents: '📄 Não pediu ou não conferiu documentos',
  tone: '😐 Tom inadequado',
  lost_opportunity: '💸 Perdeu a oportunidade',
} as const;
export type ReviewIssue = keyof typeof REVIEW_ISSUES;

/** A conversation the AI took part in is reviewed once it stopped: quiet, taken over, or the customer left. */
export function readyForReview(input: {
  aiReplied: boolean;
  lastMessageAt: Date | null;
  paused: boolean;
  optedOut: boolean;
  alreadyReviewedLastMessage: boolean;
  now: Date;
}) {
  if (!input.aiReplied || input.alreadyReviewedLastMessage || !input.lastMessageAt) return false;
  if (input.paused || input.optedOut) return true;
  return input.now.getTime() - input.lastMessageAt.getTime() >= REVIEW_QUIET_HOURS * 3_600_000;
}

/** Whether the daily review runs now: from 6:00 to 7:59, Brasília time. */
export function inDailyReviewWindow(now: Date) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(now));
  return (DAILY_REVIEW_HOURS as readonly number[]).includes(hour);
}

/** A review that becomes an alert for the managers: low score, or the AI invented or should have passed it on. */
export function reviewNeedsAttention(review: { score: number; issues: unknown }) {
  if (review.score <= 2) return true;
  const issues = parseIssues(review.issues);
  return ALERT_ISSUES.some((issue) => issues.includes(issue));
}

/** "Nota 3 · 🌀 Inventou informação: ..." for the alert line. */
export function reviewAlertDetail(review: { score: number; issues: unknown; summary: string }) {
  const labels = parseIssues(review.issues)
    .filter((issue) => (ALERT_ISSUES as readonly string[]).includes(issue))
    .map((issue) => REVIEW_ISSUES[issue]);
  return `Nota ${review.score}${labels.length ? ` · ${labels.join(' · ')}` : ''}: ${review.summary}`;
}

export function parseIssues(value: unknown): ReviewIssue[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is ReviewIssue => typeof item === 'string' && item in REVIEW_ISSUES))]
    : [];
}

/** "32 conversas revisadas, nota média 4,1; problemas mais comuns: ..." for the week. */
export function weeklySummary(reviews: Array<{ score: number; issues: ReviewIssue[] }>) {
  if (!reviews.length) return null;
  const average = reviews.reduce((sum, review) => sum + review.score, 0) / reviews.length;
  const counts = new Map<ReviewIssue, number>();
  for (const review of reviews) for (const issue of review.issues) counts.set(issue, (counts.get(issue) || 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return {
    reviewed: reviews.length,
    average: Math.round(average * 10) / 10,
    topIssues: top.map(([issue, count]) => ({ issue, label: REVIEW_ISSUES[issue], count })),
  };
}
