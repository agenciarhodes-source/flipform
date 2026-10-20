/**
 * The Flip's suggestions: when to suggest a follow-up task, a lead transfer or rebalancing a
 * portfolio. Pure rules, kept apart from the database so they are easy to test.
 */
export const SUGGESTION_RULES = {
  transferAfterHours: 4,
  /** The receiving attendant must carry clearly less than the current one. */
  transferTargetMaxShare: 0.75,
  dismissedCooldownDays: 7,
  maxRebalanceLeads: 20,
} as const;

export type SuggestionKind = 'create_task' | 'transfer_lead' | 'rebalance';

/** Whether a subject may get a new suggestion, given the last ones made for it. */
export function canSuggestAgain(last: { status: string; createdAt: Date; decidedAt: Date | null } | null, now: Date) {
  if (!last) return true;
  if (last.status === 'pending') return false;
  if (last.status === 'expired') return true;
  const since = (last.decidedAt || last.createdAt).getTime();
  return now.getTime() - since >= SUGGESTION_RULES.dismissedCooldownDays * 86_400_000;
}

/** The attendant with the fewest open leads, if clearly less loaded than the current owner. */
export function lighterAttendant(
  ownerId: string,
  loads: Array<{ userId: string; name: string; openLeads: number }>,
) {
  const owner = loads.find((item) => item.userId === ownerId);
  if (!owner) return null;
  const candidates = loads.filter((item) => item.userId !== ownerId).sort((a, b) => a.openLeads - b.openLeads);
  const target = candidates[0];
  if (!target) return null;
  return target.openLeads <= owner.openLeads * SUGGESTION_RULES.transferTargetMaxShare ? { owner, target } : null;
}

/** How many leads to move so the overloaded attendant gets close to the team average. */
export function rebalanceCount(input: { ownerOpen: number; average: number; staleAvailable: number }) {
  const excess = Math.floor(input.ownerOpen - input.average);
  return Math.max(0, Math.min(excess, input.staleAvailable, SUGGESTION_RULES.maxRebalanceLeads));
}

/** The next business slot for a follow-up: in one hour on a weekday from 8h to 17h, else 9h of the next weekday (Brasília). */
export function nextFollowUpSlot(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const weekday = get('weekday');
  const hour = Number(get('hour'));
  const businessDay = !['Sat', 'Sun'].includes(weekday);
  if (businessDay && hour >= 8 && hour < 17) return new Date(now.getTime() + 3_600_000);
  let day = new Date(`${get('year')}-${get('month')}-${get('day')}T09:00:00-03:00`);
  if (businessDay && hour < 8) return day;
  do {
    day = new Date(day.getTime() + 86_400_000);
  } while ([0, 6].includes(new Date(day.getTime() - 3 * 3_600_000).getUTCDay()));
  return day;
}
