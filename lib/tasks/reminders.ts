/** When a task owner may be reminded. Null means no reminder. */
export const TASK_REMINDER_OPTIONS = [
  { minutes: null, label: 'Sem aviso' },
  { minutes: 5, label: '5 minutos antes' },
  { minutes: 15, label: '15 minutos antes' },
  { minutes: 30, label: '30 minutos antes' },
  { minutes: 60, label: '1 hora antes' },
  { minutes: 1440, label: '1 dia antes' },
] as const;

export const TASK_REMINDER_MINUTES = [5, 15, 30, 60, 1440] as const;
/** What a new task gets unless the person chooses otherwise. */
export const DEFAULT_TASK_REMINDER_MINUTES = 5;
/** A reminder stays visible this long after the due time, then the task is simply overdue. */
export const TASK_REMINDER_GRACE_MINUTES = 60;

export function isTaskReminderDue(input: {
  dueDate: Date | null;
  remindMinutesBefore: number | null;
  status: string;
  now?: Date;
}) {
  if (input.status !== 'pending' || !input.dueDate || !input.remindMinutesBefore) return false;
  const now = (input.now || new Date()).getTime();
  const due = input.dueDate.getTime();
  return now >= due - input.remindMinutesBefore * 60_000 && now <= due + TASK_REMINDER_GRACE_MINUTES * 60_000;
}
