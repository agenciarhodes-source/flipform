export type TrackingLogSummary = {
  id: string;
  eventId?: string | null;
  status: string;
  reason?: string | null;
  createdAt: string | Date;
  [key: string]: unknown;
};

const LEGACY_NON_ACTIONABLE_REASONS = new Set([
  'Meta Purchase não enviado: venda sem valor monetário registrado.',
]);

export function getFinalTrackingLogs<T extends TrackingLogSummary>(logs: T[]) {
  const byEventId = new Map<string, T>();
  const standalone: T[] = [];

  for (const log of logs) {
    // Preserve the historical row in the database, but stop surfacing the old
    // stage-based Purchase "skip" as if it were an integration problem.
    if (log.status === 'skipped' && log.reason && LEGACY_NON_ACTIONABLE_REASONS.has(log.reason)) {
      continue;
    }

    if (!log.eventId) {
      standalone.push(log);
      continue;
    }

    const current = byEventId.get(log.eventId);
    if (!current || new Date(log.createdAt).getTime() > new Date(current.createdAt).getTime()) {
      byEventId.set(log.eventId, log);
    }
  }

  return [...byEventId.values(), ...standalone].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
