/**
 * Global typing pace of the public chat, for every agent of every company.
 *
 * The reply is only shown after the time a person would plausibly take to write it,
 * so a long answer does not appear instantly as if it had been pasted. The time the
 * model already spent answering counts towards it: the visitor never waits twice.
 */
export const FLIP_AI_TYPING_MS_PER_CHARACTER = 35;
export const FLIP_AI_TYPING_MIN_MS = 1_200;
export const FLIP_AI_TYPING_MAX_MS = 7_000;

/** How long the "Escrevendo..." indicator should still stay on screen before the reply appears. */
export function resolveTypingDelayMs(replyLength: number, elapsedMs: number) {
  const length = Number.isFinite(replyLength) ? Math.max(0, replyLength) : 0;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const target = Math.min(
    FLIP_AI_TYPING_MAX_MS,
    Math.max(FLIP_AI_TYPING_MIN_MS, length * FLIP_AI_TYPING_MS_PER_CHARACTER),
  );
  return Math.max(0, Math.round(target - elapsed));
}
