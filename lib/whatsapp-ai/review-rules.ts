/**
 * Supervision of the AI on WhatsApp: which conversations to review and how to count the problems.
 * Pure rules, easy to test.
 */
export const REVIEW_QUIET_HOURS = 2;
export const REVIEWS_PER_OPEN = 10;

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
