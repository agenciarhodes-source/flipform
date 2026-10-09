import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { summarizeFlipAiQualificationScore } from '../lib/flip-ai/qualification-score';

test('score combina aderência, intenção e confiança com pesos fixos', () => {
  const summary = summarizeFlipAiQualificationScore({ classification: 'qualified', fitScore: 90, intentScore: 80, confidence: 0.9 });
  // 90 * 40/75 + 80 * 30/75 + 90 * 5/75 = 48 + 32 + 6
  assert.equal(summary.score, 86);
  assert.equal(summary.temperature, 'hot');
  assert.deepEqual(summarizeFlipAiQualificationScore({ classification: 'qualified', fitScore: 100, intentScore: 100, confidence: 1 }).score, 100);
  assert.deepEqual(summarizeFlipAiQualificationScore({ classification: 'disqualified', fitScore: 0, intentScore: 0, confidence: 0 }).score, 0);
});

test('temperatura sugerida segue a classificação e o score', () => {
  assert.equal(summarizeFlipAiQualificationScore({ classification: 'nurture', fitScore: 60, intentScore: 55, confidence: 0.7 }).temperature, 'warm');
  assert.equal(summarizeFlipAiQualificationScore({ classification: 'nurture', fitScore: 40, intentScore: 30, confidence: 0.6 }).temperature, 'cold');
  assert.equal(summarizeFlipAiQualificationScore({ classification: 'disqualified', fitScore: 95, intentScore: 95, confidence: 0.9 }).temperature, 'cold');
  assert.equal(summarizeFlipAiQualificationScore({ classification: 'disqualified', fitScore: 95, intentScore: 95, confidence: 0.9 }).score, 10);
  assert.equal(summarizeFlipAiQualificationScore({ classification: 'disqualified', fitScore: 10, intentScore: 30, confidence: 0.9 }).score, 10);
  assert.equal(summarizeFlipAiQualificationScore({ classification: 'qualified', fitScore: 10, intentScore: 10, confidence: 0.6 }).temperature, 'hot');
});

test('informação insuficiente não gera score nem temperatura', () => {
  for (const classification of ['insufficient', null, undefined, '']) {
    const summary = summarizeFlipAiQualificationScore({ classification, fitScore: 90, intentScore: 90, confidence: 0.9 });
    assert.equal(summary.score, null);
    assert.equal(summary.temperature, 'unknown');
  }
});

test('valores inválidos ou fora da faixa são contidos', () => {
  assert.equal(summarizeFlipAiQualificationScore({ classification: 'nurture', fitScore: 500, intentScore: -20, confidence: 9 }).score, 60);
  assert.equal(summarizeFlipAiQualificationScore({ classification: 'nurture', fitScore: Number.NaN, intentScore: null, confidence: undefined }).score, 0);
});

test('cálculo é local: sem IA, sem rede, sem banco', () => {
  const source = readFileSync('lib/flip-ai/qualification-score.ts', 'utf8');
  for (const forbidden of ['fetch(', 'prisma', 'openai', 'server-only', 'process.env']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
