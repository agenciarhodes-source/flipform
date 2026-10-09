import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFlipAiHumanHandoffSnapshot } from '../lib/flip-ai/human-handoff-policy';

function handoff(classification: string | null) {
  return buildFlipAiHumanHandoffSnapshot({
    leadName: 'Rafael',
    hasPhone: true,
    hasEmail: false,
    answers: [],
    qualification: classification
      ? { summary: 'Resumo.', reasons: ['Motivo.'], nextAction: 'Encaminhar.', classification }
      : null,
    stateSummary: null,
    intelligence: null,
    conversationId: 'conversation-1',
    updatedAt: new Date('2026-10-09T20:00:00.000Z'),
  });
}

test('prioridade do resumo segue o veredito do atendente de IA', () => {
  assert.equal(handoff('qualified').priority, 'high');
  assert.equal(handoff('qualified').recommended, true);
  assert.equal(handoff('nurture').priority, 'normal');
  assert.equal(handoff('insufficient').priority, 'normal');
  assert.equal(handoff('disqualified').priority, 'low');
  assert.equal(handoff('disqualified').recommended, false);
  assert.equal(handoff(null).priority, 'low');
});
