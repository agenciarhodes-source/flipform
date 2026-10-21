const HOUR_MS = 3_600_000;
/** Meta accepts server events up to 7 days old; one hour of margin. */
export const META_REPLAY_MAX_AGE_MS = 7 * 24 * HOUR_MS - HOUR_MS;
/**
 * A form Lead also went to Meta from the browser Pixel with the same event_id. Meta only merges the
 * two copies within 48 hours, so older form Leads are not resent (they would count twice).
 */
export const META_REPLAY_FORM_LEAD_MAX_AGE_MS = 48 * HOUR_MS - HOUR_MS;

/** Whether a failed Meta event may still be resent, by its source and age. */
export function canReplayMetaEvent(log: { source: string | null; eventName: string; createdAt: Date }, now = new Date()) {
  const age = now.getTime() - log.createdAt.getTime();
  if (age < 0 || age > META_REPLAY_MAX_AGE_MS) return false;
  if (log.eventName === 'Purchase') return false; // purchases have their own flow, tied to the registered sale
  if (log.source === 'public_form') return log.eventName === 'Lead' ? age <= META_REPLAY_FORM_LEAD_MAX_AGE_MS : false;
  return log.source === 'kanban';
}
