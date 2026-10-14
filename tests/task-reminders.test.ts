import assert from 'node:assert/strict';
import test from 'node:test';

import { isTaskReminderDue } from '../lib/tasks/reminders';
import { taskCreateSchema, taskUpdateSchema } from '../lib/schemas-tasks';

const now = new Date('2026-10-15T15:00:00Z');
const inMinutes = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

test('avisa a partir do tempo escolhido antes do vencimento', () => {
  assert.equal(isTaskReminderDue({ dueDate: inMinutes(4), remindMinutesBefore: 5, status: 'pending', now }), true);
  assert.equal(isTaskReminderDue({ dueDate: inMinutes(6), remindMinutesBefore: 5, status: 'pending', now }), false);
  assert.equal(isTaskReminderDue({ dueDate: inMinutes(59), remindMinutesBefore: 60, status: 'pending', now }), true);
  assert.equal(isTaskReminderDue({ dueDate: inMinutes(61), remindMinutesBefore: 60, status: 'pending', now }), false);
  // Still shown for a while after the time, then the task is just overdue.
  assert.equal(isTaskReminderDue({ dueDate: inMinutes(-30), remindMinutesBefore: 5, status: 'pending', now }), true);
  assert.equal(isTaskReminderDue({ dueDate: inMinutes(-90), remindMinutesBefore: 5, status: 'pending', now }), false);
});

test('sem aviso, sem vencimento ou tarefa concluída não avisa', () => {
  assert.equal(isTaskReminderDue({ dueDate: inMinutes(3), remindMinutesBefore: null, status: 'pending', now }), false);
  assert.equal(isTaskReminderDue({ dueDate: null, remindMinutesBefore: 5, status: 'pending', now }), false);
  assert.equal(isTaskReminderDue({ dueDate: inMinutes(3), remindMinutesBefore: 5, status: 'completed', now }), false);
});

test('só aceita os tempos de aviso oferecidos', () => {
  assert.equal(taskCreateSchema.safeParse({ title: 'Ligar', remindMinutesBefore: 60 }).success, true);
  assert.equal(taskCreateSchema.safeParse({ title: 'Ligar', remindMinutesBefore: null }).success, true);
  assert.equal(taskCreateSchema.safeParse({ title: 'Ligar', remindMinutesBefore: 7 }).success, false);
  assert.equal(taskUpdateSchema.safeParse({ remindMinutesBefore: 1440 }).success, true);
});
