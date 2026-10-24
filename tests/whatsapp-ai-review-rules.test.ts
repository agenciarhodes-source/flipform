import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inDailyReviewWindow,
  parseIssues,
  readyForReview,
  reviewAlertDetail,
  reviewNeedsAttention,
  weeklySummary,
} from '../lib/whatsapp-ai/review-rules';

const now = new Date('2026-10-21T15:00:00Z');
const base = { aiReplied: true, lastMessageAt: new Date(now.getTime() - 3 * 3_600_000), paused: false, optedOut: false, alreadyReviewedLastMessage: false, now };

test('revisa conversas da IA paradas há 2 h, assumidas ou em que o cliente saiu', () => {
  assert.equal(readyForReview(base), true);
  assert.equal(readyForReview({ ...base, lastMessageAt: new Date(now.getTime() - 30 * 60_000) }), false);
  assert.equal(readyForReview({ ...base, lastMessageAt: new Date(now.getTime() - 30 * 60_000), paused: true }), true);
  assert.equal(readyForReview({ ...base, lastMessageAt: new Date(now.getTime() - 30 * 60_000), optedOut: true }), true);
  assert.equal(readyForReview({ ...base, aiReplied: false }), false);
  assert.equal(readyForReview({ ...base, alreadyReviewedLastMessage: true }), false);
});

test('só etiquetas conhecidas, sem repetir', () => {
  assert.deepEqual(parseIssues(['stuck', 'stuck', 'invented', 'tone']), ['stuck', 'tone']);
  assert.deepEqual(parseIssues(null), []);
});

test('resumo da semana com média e problemas mais comuns', () => {
  const summary = weeklySummary([
    { score: 5, issues: [] },
    { score: 2, issues: ['should_handoff', 'wrong_answer'] },
    { score: 3, issues: ['should_handoff'] },
  ]);
  assert.equal(summary?.reviewed, 3);
  assert.equal(summary?.average, 3.3);
  assert.equal(summary?.topIssues[0].issue, 'should_handoff');
  assert.equal(weeklySummary([]), null);
});

test('a avaliação diária roda das 6h às 7h59 de Brasília', () => {
  assert.equal(inDailyReviewWindow(new Date('2026-10-24T09:30:00Z')), true); // 6h30
  assert.equal(inDailyReviewWindow(new Date('2026-10-24T10:59:00Z')), true); // 7h59
  assert.equal(inDailyReviewWindow(new Date('2026-10-24T11:00:00Z')), false); // 8h
  assert.equal(inDailyReviewWindow(new Date('2026-10-24T08:59:00Z')), false); // 5h59
});

test('vira alerta: nota baixa, IA inventou ou devia ter passado para uma pessoa', () => {
  assert.equal(reviewNeedsAttention({ score: 2, issues: [] }), true);
  assert.equal(reviewNeedsAttention({ score: 4, issues: ['made_up'] }), true);
  assert.equal(reviewNeedsAttention({ score: 3, issues: ['should_handoff'] }), true);
  assert.equal(reviewNeedsAttention({ score: 3, issues: ['tone'] }), false);
  assert.equal(reviewNeedsAttention({ score: 5, issues: 'x' }), false);
  assert.match(reviewAlertDetail({ score: 3, issues: ['made_up', 'tone'], summary: 'Citou prazo errado.' }), /^Nota 3 · .*Inventou informação: Citou prazo errado\.$/);
});
