/**
 * Reactivation message on WhatsApp: when the customer has been silent for 23 hours after the
 * company's last message, the AI sends one cordial reminder of where the conversation stopped.
 * At 23 hours the 24-hour customer service window is still open, so no paid template is needed.
 * Pure rules, easy to test.
 */
import { isOutcomeStageName } from './stage-rules';

export const REACTIVATION_AFTER_HOURS = 23;
/** The window closes 24 h after the customer's last message; this margin keeps the send inside it. */
export const REACTIVATION_LAST_MINUTE = 23 * 60 + 50;
/** A person of the team who wrote less than this ago is still in the conversation: no reminder. */
export const REACTIVATION_MIN_SILENCE_AFTER_TEAM_MS = 2 * 3_600_000;

export type ReactivationCandidate = {
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  leadStatus: string | null;
  /** The lead's stage: "Não qualificado" or "Já é cliente" never get a reminder. */
  leadStageName?: string | null;
};

/** Whether this conversation is due for its reminder now. */
export function reactivationDue(candidate: ReactivationCandidate, now: Date) {
  if (!candidate.lastInboundAt || !candidate.lastOutboundAt) return false;
  // The company spoke last and the customer did not answer.
  if (candidate.lastOutboundAt <= candidate.lastInboundAt) return false;
  const minutesSinceCustomer = (now.getTime() - candidate.lastInboundAt.getTime()) / 60_000;
  if (minutesSinceCustomer < REACTIVATION_AFTER_HOURS * 60 || minutesSinceCustomer > REACTIVATION_LAST_MINUTE) return false;
  if (now.getTime() - candidate.lastOutboundAt.getTime() < REACTIVATION_MIN_SILENCE_AFTER_TEAM_MS) return false;
  // Closed deals (won or lost) are left alone.
  if (candidate.leadStatus && candidate.leadStatus !== 'open') return false;
  // Not qualified or already a client: a reminder costs and helps no one.
  if (isOutcomeStageName(candidate.leadStageName)) return false;
  return true;
}

/** One reminder per silence: keyed by the customer's last message. */
export function reactivationKey(conversationId: string, lastInboundAt: Date) {
  return `whatsapp-reactivation:${conversationId}:${lastInboundAt.getTime()}`;
}

/** Keeps the reminder short and plain for WhatsApp; empty when the model gave nothing usable. */
export function cleanReactivationText(value: string) {
  return value
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^#+\s*/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 600);
}
