/**
 * Anti-robot check for public forms (security protocol S4), with no key and no captcha:
 * - a hidden field people never see ("honeypot"): robots fill every field, people leave it empty;
 * - a minimum time between opening the form and sending it: robots send in milliseconds.
 * Submissions without the check (older pages still open, direct integrations) are accepted.
 * Pure rules, easy to test.
 */

export const FORM_MIN_FILL_MS = 2_500;

export type FormGuard = { hp?: string; elapsedMs?: number } | undefined;
export type BotReason = 'honeypot' | 'too_fast';

export function formBotReason(guard: FormGuard): BotReason | null {
  if (!guard) return null;
  if (typeof guard.hp === 'string' && guard.hp.trim() !== '') return 'honeypot';
  if (typeof guard.elapsedMs === 'number' && guard.elapsedMs >= 0 && guard.elapsedMs < FORM_MIN_FILL_MS) return 'too_fast';
  return null;
}

/** Sends per person (IP) and form: enough for a family sharing the internet, too few for a flood. */
export const FORM_SUBMIT_LIMIT = { limit: 20, windowMs: 10 * 60_000 } as const;
