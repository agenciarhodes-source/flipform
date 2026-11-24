/** PR629: timestamps are observational only, never automatic purge authorization. */
function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/** Called exclusively on an actual integration status transition. */
export function nextApiIntegrationDisabledAt(
  nextStatus: 'active' | 'disabled', now: Date,
): Date | null {
  if (!validDate(now)) throw new Error('API_V1_INVALID_LIFECYCLE_CLOCK');
  return nextStatus === 'disabled' ? new Date(now.getTime()) : null;
}

/** Fixes an individual quota window end to the policy at the first insertion. */
export function apiV1QuotaWindowEnd(start: Date, durationMs: number): Date {
  if (!validDate(start) || !Number.isSafeInteger(durationMs) || durationMs < 1000) {
    throw new Error('API_V1_QUOTA_INVALID_WINDOW_END');
  }
  const end = new Date(start.getTime() + durationMs);
  if (!validDate(end) || end <= start) throw new Error('API_V1_QUOTA_INVALID_WINDOW_END');
  return end;
}

/** An unresolved retry or dead-letter must never start the retention timer. */
export function diagnosticOutboxFinalizedAt(
  nextState: 'simulated_success' | 'retry' | 'dead_letter', now: Date,
): Date | null {
  if (nextState !== 'simulated_success') return null;
  if (!validDate(now)) throw new Error('API_V1_INVALID_LIFECYCLE_CLOCK');
  return new Date(now.getTime());
}
