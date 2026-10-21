import assert from 'node:assert/strict';
import test from 'node:test';

import { attendantSpeed, formatDuration, median, parseAttendantReview } from '../lib/reports/attendance-productivity-rules';

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 20, 12, 0) + minutes * 60_000);
const range = { from: at(-60), to: at(1_000) };

test('o tempo de resposta conta da primeira mensagem do cliente que espera até a resposta da pessoa', () => {
  const stats = attendantSpeed([
    { conversationId: 'c1', direction: 'inbound', sentByUserId: null, fromAi: false, at: at(0) },
    { conversationId: 'c1', direction: 'inbound', sentByUserId: null, fromAi: false, at: at(3) },
    { conversationId: 'c1', direction: 'outbound', sentByUserId: 'u1', fromAi: false, at: at(10) },
    { conversationId: 'c1', direction: 'outbound', sentByUserId: 'u1', fromAi: false, at: at(11) },
    { conversationId: 'c1', direction: 'inbound', sentByUserId: null, fromAi: false, at: at(20) },
    { conversationId: 'c1', direction: 'outbound', sentByUserId: 'u1', fromAi: false, at: at(80) },
  ], range);
  const u1 = stats.get('u1')!;
  assert.equal(u1.conversations, 1);
  assert.equal(u1.messages, 3);
  assert.equal(u1.responses, 2);
  assert.equal(u1.firstResponseMedianMs, 10 * 60_000);
  assert.equal(u1.medianResponseMs, 35 * 60_000);
  assert.equal(u1.within15MinPct, 50);
});

test('resposta da IA encerra a espera e não conta para ninguém', () => {
  const stats = attendantSpeed([
    { conversationId: 'c1', direction: 'inbound', sentByUserId: null, fromAi: false, at: at(0) },
    { conversationId: 'c1', direction: 'outbound', sentByUserId: null, fromAi: true, at: at(1) },
    { conversationId: 'c1', direction: 'outbound', sentByUserId: 'u1', fromAi: false, at: at(30) },
  ], range);
  assert.equal(stats.get('u1')!.responses, 0);
  assert.equal(stats.get('u1')!.messages, 1);
});

test('mensagens fora do período não entram', () => {
  const stats = attendantSpeed([
    { conversationId: 'c1', direction: 'inbound', sentByUserId: null, fromAi: false, at: at(-200) },
    { conversationId: 'c1', direction: 'outbound', sentByUserId: 'u1', fromAi: false, at: at(-100) },
  ], range);
  assert.equal(stats.has('u1'), false);
});

test('mediana e duração legível', () => {
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 3);
  assert.equal(formatDuration(null), '—');
  assert.equal(formatDuration(20_000), 'menos de 1 min');
  assert.equal(formatDuration(12 * 60_000), '12 min');
  assert.equal(formatDuration(125 * 60_000), '2 h 5 min');
  assert.equal(formatDuration(3 * 86_400_000), '3 dias');
});

test('a avaliação só aceita pessoas enviadas e limita nota e listas', () => {
  const keys = new Map([['A1', { userId: 'u1', name: 'Ana' }]]);
  const parsed = parseAttendantReview({
    summary: 'Equipe atenciosa.',
    attendants: [
      { key: 'A1', score: 14, strengths: ['a', 'b', 'c', 'd'], improvements: ['x'], example: null },
      { key: 'A9', score: 5, strengths: [], improvements: [], example: null },
    ],
  }, keys);
  assert.equal(parsed.attendants.length, 1);
  assert.equal(parsed.attendants[0].score, 10);
  assert.equal(parsed.attendants[0].strengths.length, 3);
  assert.equal(parsed.attendants[0].name, 'Ana');
});
