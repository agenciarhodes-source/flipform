import assert from 'node:assert/strict';
import test from 'node:test';

import { closerTakeoverEligible } from '../lib/whatsapp-ai/closer-takeover-rules';

const now = new Date('2026-10-28T13:00:00Z');
const base = {
  status: 'open', aiPaused: false, lastInboundAt: new Date('2026-10-28T02:43:00Z'),
  aiSpokeLast: true, aiLastWasQuestion: false, teamInvolved: false,
  stage: { isFirst: false, isOutcome: false },
};

test('caso triado e passado para a equipe pelo Analista é retomado pelo Closer', () => {
  assert.equal(closerTakeoverEligible(base, now), true);
});

test('não retoma: fora da janela de 24h, equipe na conversa, pausada ou resolvida', () => {
  assert.equal(closerTakeoverEligible({ ...base, lastInboundAt: new Date('2026-10-27T10:00:00Z') }, now), false);
  assert.equal(closerTakeoverEligible({ ...base, teamInvolved: true }, now), false);
  assert.equal(closerTakeoverEligible({ ...base, aiPaused: true }, now), false);
  assert.equal(closerTakeoverEligible({ ...base, status: 'resolved' }, now), false);
});

test('não retoma: triagem incompleta, desfecho, cliente falou por último ou IA esperando resposta', () => {
  assert.equal(closerTakeoverEligible({ ...base, stage: { isFirst: true, isOutcome: false } }, now), false);
  assert.equal(closerTakeoverEligible({ ...base, stage: { isFirst: false, isOutcome: true } }, now), false);
  assert.equal(closerTakeoverEligible({ ...base, stage: null }, now), false);
  assert.equal(closerTakeoverEligible({ ...base, aiSpokeLast: false }, now), false);
  assert.equal(closerTakeoverEligible({ ...base, aiLastWasQuestion: true }, now), false);
});
