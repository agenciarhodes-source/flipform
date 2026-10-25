/**
 * Welcome on WhatsApp after a form: who sent a form and did not write on WhatsApp within a few
 * minutes gets one approved template, so the conversation starts and the AI takes over when the
 * person answers. Global for every company. Pure rules, easy to test.
 */

/** Only fresh leads: an older one is a different conversation, not a welcome. */
export const WELCOME_LOOKBACK_HOURS = 24;
export const WELCOME_DEFAULT_DELAY_MINUTES = 2;
export const WELCOME_DEFAULT_DELAY_SECONDS = 30;
export const WELCOME_MIN_DELAY_SECONDS = 30;
export const WELCOME_MAX_DELAY_SECONDS = 3600;

/** The wait in seconds, from the new setting or, for older settings, the minutes. */
export function welcomeDelaySeconds(settings: { delaySeconds?: number | null; delayMinutes: number }) {
  const seconds = settings.delaySeconds ?? settings.delayMinutes * 60;
  return Math.max(WELCOME_MIN_DELAY_SECONDS, Math.min(WELCOME_MAX_DELAY_SECONDS, Math.round(seconds)));
}
export const WELCOME_MAX_PER_COMPANY_PER_RUN = 20;

/** The window of leads to look at now: arrived after the option was on, and at least `delay` ago. */
export function welcomeWindow(input: { enabledAt: Date; delaySeconds: number; now: Date }) {
  const lookback = new Date(input.now.getTime() - WELCOME_LOOKBACK_HOURS * 3_600_000);
  return {
    from: input.enabledAt > lookback ? input.enabledAt : lookback,
    until: new Date(input.now.getTime() - Math.max(WELCOME_MIN_DELAY_SECONDS, input.delaySeconds) * 1_000),
  };
}

/** The person already wrote on WhatsApp in the last 24 hours: the AI answers, no template needed. */
export function customerAlreadyWrote(lastInboundAt: Date | null | undefined, now: Date) {
  return Boolean(lastInboundAt && now.getTime() - lastInboundAt.getTime() < 24 * 3_600_000);
}

export type WelcomeSkipReason = 'no_consent' | 'opted_out' | 'invalid_phone' | 'customer_wrote' | 'no_conversation';

/** Why a lead does not get the welcome, or null when it may go. */
export function welcomeSkipReason(input: {
  consent: boolean;
  optedOut: boolean;
  validMobile: boolean;
}): WelcomeSkipReason | null {
  if (!input.validMobile) return 'invalid_phone';
  if (!input.consent) return 'no_consent';
  if (input.optedOut) return 'opted_out';
  return null;
}
