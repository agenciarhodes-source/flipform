import assert from 'node:assert/strict';
import test from 'node:test';

import { canSuggestAgain, lighterAttendant, nextFollowUpSlot, rebalanceCount } from '../lib/flip/suggestion-rules';

const now = new Date('2026-10-21T15:00:00Z'); // quarta, 12h em Brasília
const DAY = 86_400_000;

test('dispensada não volta por 7 dias; pendente não duplica', () => {
  assert.equal(canSuggestAgain(null, now), true);
  assert.equal(canSuggestAgain({ status: 'pending', createdAt: now, decidedAt: null }, now), false);
  assert.equal(canSuggestAgain({ status: 'dismissed', createdAt: now, decidedAt: new Date(now.getTime() - 3 * DAY) }, now), false);
  assert.equal(canSuggestAgain({ status: 'dismissed', createdAt: now, decidedAt: new Date(now.getTime() - 8 * DAY) }, now), true);
  assert.equal(canSuggestAgain({ status: 'expired', createdAt: now, decidedAt: now }, now), true);
});

test('só sugere transferir para quem está bem menos carregada', () => {
  const loads = [
    { userId: 'a', name: 'Clarice', openLeads: 18 },
    { userId: 'b', name: 'Mônica', openLeads: 4 },
    { userId: 'c', name: 'Ana', openLeads: 16 },
  ];
  assert.equal(lighterAttendant('a', loads)?.target.userId, 'b');
  assert.equal(lighterAttendant('b', loads), null);
});

test('redistribui até perto da média, só leads parados e no máximo 20', () => {
  assert.equal(rebalanceCount({ ownerOpen: 30, average: 12, staleAvailable: 10 }), 10);
  assert.equal(rebalanceCount({ ownerOpen: 30, average: 12, staleAvailable: 40 }), 18);
  assert.equal(rebalanceCount({ ownerOpen: 60, average: 10, staleAvailable: 40 }), 20);
  assert.equal(rebalanceCount({ ownerOpen: 10, average: 12, staleAvailable: 5 }), 0);
});

test('retorno em 1 hora no expediente; senão às 9h do próximo dia útil', () => {
  assert.equal(nextFollowUpSlot(now).toISOString(), '2026-10-21T16:00:00.000Z');
  assert.equal(nextFollowUpSlot(new Date('2026-10-21T22:00:00Z')).toISOString(), '2026-10-22T12:00:00.000Z'); // quarta 19h -> quinta 9h
  assert.equal(nextFollowUpSlot(new Date('2026-10-23T22:00:00Z')).toISOString(), '2026-10-26T12:00:00.000Z'); // sexta 19h -> segunda 9h
  assert.equal(nextFollowUpSlot(new Date('2026-10-21T09:00:00Z')).toISOString(), '2026-10-21T12:00:00.000Z'); // quarta 6h -> 9h
});
