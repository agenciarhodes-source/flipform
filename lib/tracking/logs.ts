export type TrackingLogSummary = {
  id: string;
  eventId?: string | null;
  status: string;
  createdAt: string | Date;
  [key: string]: unknown;
};

export function getFinalTrackingLogs<T extends TrackingLogSummary>(logs: T[]) {
  const byEventId = new Map<string, T>();
  const standalone: T[] = [];

  for (const log of logs) {
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
