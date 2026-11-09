import assert from 'node:assert/strict';
import test from 'node:test';

import { FLIP_DAILY_REQUEST_LIMIT, flipRequestsLeft, startOfBrasiliaDay } from '../lib/flip/daily-limit';

test('3 solicitações por dia, sem passar de 0', () => {
  assert.equal(FLIP_DAILY_REQUEST_LIMIT, 3);
  assert.equal(flipRequestsLeft(0), 3);
  assert.equal(flipRequestsLeft(2), 1);
  assert.equal(flipRequestsLeft(3), 0);
  assert.equal(flipRequestsLeft(7), 0);
});

test('o dia vira à meia-noite de Brasília', () => {
  // 01:30 UTC de 10/11 ainda é 22:30 de 09/11 em Brasília.
  assert.equal(startOfBrasiliaDay(new Date('2026-11-10T01:30:00Z')).toISOString(), '2026-11-09T03:00:00.000Z');
  // 03:00 UTC de 10/11 já é meia-noite de 10/11 em Brasília.
  assert.equal(startOfBrasiliaDay(new Date('2026-11-10T03:00:00Z')).toISOString(), '2026-11-10T03:00:00.000Z');
});
