import assert from 'node:assert/strict';
import test from 'node:test';

import { matchName, percent, resolvePeriod } from '../lib/flip/ask-rules';
import { periodDays, previousPeriod } from '../lib/flip/ask-rules';

const now = new Date('2026-10-21T15:00:00Z'); // quarta, 21/10 12h em Brasília

test('períodos em horário de Brasília', () => {
  const month = resolvePeriod({ period: 'this_month', from: null, to: null }, now);
  assert.equal(month.start.toISOString(), '2026-10-01T03:00:00.000Z');
  assert.equal(month.end.toISOString(), '2026-10-22T03:00:00.000Z');
  const last = resolvePeriod({ period: 'last_month', from: null, to: null }, now);
  assert.equal(last.start.toISOString(), '2026-09-01T03:00:00.000Z');
  assert.equal(last.end.toISOString(), '2026-10-01T03:00:00.000Z');
  const week = resolvePeriod({ period: 'this_week', from: null, to: null }, now);
  assert.equal(week.start.toISOString(), '2026-10-19T03:00:00.000Z'); // segunda
  const custom = resolvePeriod({ period: 'custom', from: '2026-10-01', to: '2026-10-15' }, now);
  assert.equal(custom.end.toISOString(), '2026-10-16T03:00:00.000Z');
  assert.equal(resolvePeriod({ period: 'custom', from: 'x', to: null }, now).label, 'este mês');
});

test('o nome citado precisa apontar para uma pessoa só', () => {
  const people = [{ name: 'Mônica Souza' }, { name: 'Clarice Lima' }, { name: 'Ana Clara' }];
  assert.equal(matchName('monica', people)?.name, 'Mônica Souza');
  assert.equal(matchName('Clarice Lima', people)?.name, 'Clarice Lima');
  assert.equal(matchName('cla', people), null);
  assert.equal(matchName(null, people), null);
});

test('percentual com vírgula', () => {
  assert.equal(percent(18, 142), '12,7%');
  assert.equal(percent(1, 0), '—');
});

test('período anterior do mesmo tamanho e período em dias', () => {
  const start = new Date('2026-10-01T03:00:00Z');
  const end = new Date('2026-10-31T03:00:00Z');
  const before = previousPeriod({ start, end });
  assert.equal(before.end.toISOString(), start.toISOString());
  assert.equal(before.start.toISOString(), '2026-09-01T03:00:00.000Z');
  assert.equal(periodDays({ start, end }), 30);
  assert.equal(periodDays({ start, end: new Date(start.getTime() + 3_600_000) }), 1);
  assert.equal(periodDays({ start: new Date('2025-01-01T03:00:00Z'), end }), 90);
});
