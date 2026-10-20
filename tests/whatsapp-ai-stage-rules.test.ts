import assert from 'node:assert/strict';
import test from 'node:test';

import { acceptedSuggestion, candidateStages, exampleCriterionFor } from '../lib/whatsapp-ai/stage-rules';

const stages = [
  { id: 's0', name: 'Novo lead', orderIndex: 0, isArchived: false, rule: null },
  { id: 's1', name: 'Já é Cliente', orderIndex: 1, isArchived: false, rule: { criterion: 'já é cliente', enabled: true } },
  { id: 's2', name: 'Aguardando documentação', orderIndex: 2, isArchived: false, rule: { criterion: 'pediu documentos', enabled: true } },
  { id: 's3', name: 'Documentação enviada', orderIndex: 3, isArchived: false, rule: { criterion: '', enabled: true } },
  { id: 's4', name: 'Fechado', orderIndex: 4, isArchived: false, rule: { criterion: 'assinou', enabled: false } },
];
const now = new Date('2026-10-21T12:00:00Z');

test('só etapas à frente, ligadas e com critério', () => {
  const ids = candidateStages({ lead: { status: 'open', stageOrderIndex: 1 }, stages, lastManualMoveAt: null, now }).map((stage) => stage.id);
  assert.deepEqual(ids, ['s2']);
});

test('lead ganho ou perdido, ou movido por alguém nas últimas 24 h, não recebe sugestão', () => {
  assert.deepEqual(candidateStages({ lead: { status: 'won', stageOrderIndex: 0 }, stages, lastManualMoveAt: null, now }), []);
  const movedRecently = new Date('2026-10-21T02:00:00Z');
  assert.deepEqual(candidateStages({ lead: { status: 'open', stageOrderIndex: 0 }, stages, lastManualMoveAt: movedRecently, now }), []);
});

test('a resposta da IA só vale para uma etapa oferecida e com motivo', () => {
  const candidates = candidateStages({ lead: { status: 'open', stageOrderIndex: 0 }, stages, lastManualMoveAt: null, now });
  assert.equal(acceptedSuggestion({ move: true, stageId: 's2', reason: 'Pedimos o RG.' }, candidates)?.stage.id, 's2');
  assert.equal(acceptedSuggestion({ move: true, stageId: 's4', reason: 'Assinou.' }, candidates), null);
  assert.equal(acceptedSuggestion({ move: true, stageId: 's2', reason: '  ' }, candidates), null);
  assert.equal(acceptedSuggestion({ move: false, stageId: null, reason: '' }, candidates), null);
});

test('exemplos de critério pelo nome da etapa', () => {
  assert.match(exampleCriterionFor('Já é Cliente'), /já é cliente/);
  assert.match(exampleCriterionFor('Documentação incompleta'), /parte dos documentos/);
  assert.equal(exampleCriterionFor('Em andamento'), '');
});
