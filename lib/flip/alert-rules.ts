/**
 * The Flip, the manager inside FlipForm: the deadlines of each alert and the pure rules, kept apart
 * from the database so they are easy to test.
 */
export const FLIP_ALERT_RULES = {
  unansweredMinutes: 30,
  staleLeadDays: 3,
  /** Leads untouched for longer than this are old history, not an alert for today. */
  staleLeadLookbackDays: 30,
  newLeadWithoutContactHours: 2,
  newLeadLookbackDays: 7,
  /** An attendant with this much more open leads than the team average. */
  overloadFactor: 1.5,
} as const;

export type FlipAlertKind =
  | 'unanswered_conversation'
  | 'overdue_task'
  | 'hot_lead_without_task'
  | 'stale_lead'
  | 'new_lead_without_contact'
  | 'overloaded_attendant';

export type FlipAlert = {
  kind: FlipAlertKind;
  id: string;
  title: string;
  detail: string;
  href: string;
  ownerId: string | null;
  ownerName: string | null;
  since: string | null;
};

export const FLIP_ALERT_ORDER: FlipAlertKind[] = [
  'unanswered_conversation',
  'overdue_task',
  'hot_lead_without_task',
  'new_lead_without_contact',
  'stale_lead',
  'overloaded_attendant',
];

/** Attendants with clearly more open leads than the team average (only when the team has two or more). */
export function overloadedAttendants(openLeadsByAttendant: Array<{ userId: string; name: string; openLeads: number }>) {
  if (openLeadsByAttendant.length < 2) return [];
  const average = openLeadsByAttendant.reduce((sum, item) => sum + item.openLeads, 0) / openLeadsByAttendant.length;
  if (average <= 0) return [];
  return openLeadsByAttendant
    .filter((item) => item.openLeads > average * FLIP_ALERT_RULES.overloadFactor)
    .map((item) => ({ ...item, average: Math.round(average * 10) / 10 }));
}

/** "há 2 h", "há 3 d": how long something has been waiting. */
export function waitingFor(since: Date, now: Date) {
  const minutes = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000));
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `há ${hours} h` : `há ${Math.floor(hours / 24)} d`;
}
