import assert from 'node:assert/strict';
import test from 'node:test';

import { acceptedSuggestion, candidateStages, exampleCriterionFor } from '../lib/whatsapp-ai/stage-rules';

// The funnel of a law firm (stages out of a straight line) and of a generic sales team.
type Stage = { id: string; name: string; orderIndex: number; isArchived: boolean; rule: { criterion: string; enabled: boolean } | null };
const law: Stage[] = [
  { id: 'novo', name: 'Novo lead', orderIndex: 0, isArchived: false, rule: null },
  { id: 'cliente', name: 'Já é Cliente', orderIndex: 1, isArchived: false, rule: null },
  { id: 'retorno', name: 'Aguardando Retorno', orderIndex: 2, isArchived: false, rule: null },
  { id: 'nao-retorna', name: 'Não retorna', orderIndex: 3, isArchived: false, rule: null },
  { id: 'nq', name: 'Não qualificado', orderIndex: 4, isArchived: false, rule: null },
  { id: 'andamento', name: 'Em andamento', orderIndex: 5, isArchived: false, rule: null },
  { id: 'aguardando-doc', name: 'Aguardando Documentação', orderIndex: 6, isArchived: false, rule: null },
  { id: 'doc-enviada', name: 'Documentação Enviada', orderIndex: 7, isArchived: false, rule: null },
  { id: 'fechado', name: 'Contrato fechado', orderIndex: 8, isArchived: false, rule: null },
];
const now = new Date('2026-10-21T12:00:00Z');
const ids = (stageOrderIndex: number, stages: Stage[] = law) =>
  candidateStages({ lead: { status: 'open', stageOrderIndex }, stages, lastManualMoveAt: null, now }).map((stage) => stage.id);

test('sem critério escrito, a IA lê as etapas pelo nome (qualquer empresa)', () => {
  assert.deepEqual(ids(0), ['cliente', 'retorno', 'nq', 'andamento', 'aguardando-doc', 'doc-enviada']);
});

test('travas: nunca a primeira etapa, nem a final ou as de tempo sem critério escrito', () => {
  const offered = ids(0);
  assert.ok(!offered.includes('novo'));
  assert.ok(!offered.includes('fechado'));
  assert.ok(!offered.includes('nao-retorna'));
  const written = law.map((stage) => (stage.id === 'fechado' ? { ...stage, rule: { criterion: 'Assinou o contrato.', enabled: true } } : stage));
  assert.ok(ids(0, written).includes('fechado'));
});

test('não volta para trás, exceto para Não qualificado ou Já é cliente', () => {
  assert.deepEqual(ids(6), ['cliente', 'nq', 'doc-enviada']);
});

test('etapa desligada pela empresa nunca é usada', () => {
  const off = law.map((stage) => (stage.id === 'andamento' ? { ...stage, rule: { criterion: '', enabled: false } } : stage));
  assert.ok(!ids(0, off).includes('andamento'));
});

test('lead ganho ou perdido, ou movido por alguém nas últimas 24 h, não recebe sugestão', () => {
  assert.deepEqual(candidateStages({ lead: { status: 'won', stageOrderIndex: 0 }, stages: law, lastManualMoveAt: null, now }), []);
  const movedRecently = new Date('2026-10-21T02:00:00Z');
  assert.deepEqual(candidateStages({ lead: { status: 'open', stageOrderIndex: 0 }, stages: law, lastManualMoveAt: movedRecently, now }), []);
});

test('critério escrito vale mais que o nome', () => {
  const custom = law.map((stage) => (stage.id === 'andamento' ? { ...stage, rule: { criterion: 'Pediu a proposta.', enabled: true } } : stage));
  const stage = candidateStages({ lead: { status: 'open', stageOrderIndex: 0 }, stages: custom, lastManualMoveAt: null, now }).find((item) => item.id === 'andamento');
  assert.equal(stage?.criterion, 'Pediu a proposta.');
  assert.equal(stage?.written, true);
});

test('a resposta da IA só vale para uma etapa oferecida e com motivo', () => {
  const candidates = candidateStages({ lead: { status: 'open', stageOrderIndex: 0 }, stages: law, lastManualMoveAt: null, now });
  assert.equal(acceptedSuggestion({ move: true, stageId: 'nq', reason: 'Nunca contribuiu ao INSS.' }, candidates)?.stage.id, 'nq');
  assert.equal(acceptedSuggestion({ move: true, stageId: 'fechado', reason: 'Assinou.' }, candidates), null);
  assert.equal(acceptedSuggestion({ move: true, stageId: 'nq', reason: '  ' }, candidates), null);
  assert.equal(acceptedSuggestion({ move: false, stageId: null, reason: '' }, candidates), null);
});

test('sentido das etapas mais comuns, para qualquer ramo', () => {
  assert.match(exampleCriterionFor('Já é Cliente'), /já é cliente/);
  assert.match(exampleCriterionFor('Não qualificado'), /não tem o perfil/);
  assert.match(exampleCriterionFor('Em andamento'), /triagem foi positiva/);
  assert.match(exampleCriterionFor('Documentação incompleta'), /parte dos documentos/);
  assert.match(exampleCriterionFor('Documentação enviada'), /todos os documentos/);
  assert.match(exampleCriterionFor('Proposta enviada'), /proposta/);
  assert.match(exampleCriterionFor('Negociação'), /condições/);
  assert.match(exampleCriterionFor('Visita agendada'), /dia e horário/);
  assert.match(exampleCriterionFor('Venda ganha'), /fechamento/);
  assert.equal(exampleCriterionFor('Etapa sem nome conhecido'), '');
});
