/**
 * The Flip bar answers at most 3 requests a day per person: questions about the numbers and
 * commands about leads count together. Confirming or undoing a change does not count (no AI).
 * The day turns at midnight in Brasília. Pure rules, easy to test.
 */

export const FLIP_DAILY_REQUEST_LIMIT = 3;

/** The audit actions that are one request each. */
export const FLIP_REQUEST_ACTIONS = ['flip.question_asked', 'flip.lead_command_previewed'] as const;

/** Midnight of today in Brasília (UTC-3, no daylight saving time). */
export function startOfBrasiliaDay(now: Date) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${day}T00:00:00-03:00`);
}

export function flipRequestsLeft(used: number) {
  return Math.max(0, FLIP_DAILY_REQUEST_LIMIT - Math.max(0, used));
}

export const FLIP_LIMIT_REACHED_MESSAGE = `Você já usou as ${FLIP_DAILY_REQUEST_LIMIT} solicitações do Flip de hoje. Amanhã libera de novo.`;
