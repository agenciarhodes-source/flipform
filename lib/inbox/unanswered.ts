/** A conversation is waiting when the person wrote last and nobody answered for this long. */
export const UNANSWERED_AFTER_MINUTES = 15;
/** Older conversations are not alerted: they need a template, not a quick answer. */
export const UNANSWERED_LOOKBACK_HOURS = 24;

export function isWaitingForAnswer(input: {
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  status: string;
  now?: Date;
}) {
  if (!input.lastInboundAt || input.status === 'resolved') return false;
  if (input.lastOutboundAt && input.lastOutboundAt.getTime() >= input.lastInboundAt.getTime()) return false;
  const waited = (input.now || new Date()).getTime() - input.lastInboundAt.getTime();
  return waited >= UNANSWERED_AFTER_MINUTES * 60_000 && waited <= UNANSWERED_LOOKBACK_HOURS * 3_600_000;
}
