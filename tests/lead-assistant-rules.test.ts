import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeScope, findByName, leadAssistantPlanSchema, looksLikeLeadCommand, planDistribution, resolvedLeadAssistantPlanSchema,
} from '../lib/lead-assistant/rules';

const leads = (owners: Array<string | null>) => owners.map((assignedTo, index) => ({ id: `l${index + 1}`, assignedTo }));
const countTo = (changes: Array<{ to: string }>, id: string) => changes.filter((change) => change.to === id).length;

test('19 leads sem responsável entre 6 atendentes ficam 4, 3, 3, 3, 3, 3', () => {
  const result = planDistribution({ leads: leads(Array(19).fill(null)), targets: ['a', 'b', 'c', 'd', 'e', 'f'], mode: 'equal_split' });
  assert.equal(result.changes.length, 19);
  assert.deepEqual(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => countTo(result.changes, id)).sort(), [3, 3, 3, 3, 3, 4]);
  assert.ok(result.changes.every((change) => change.from === null));
});

test('dividir igualmente muda o mínimo: quem já é de um destino fica com ele', () => {
  // 6 leads: 4 da Ana (a), 2 do antigo (x); dividir entre a e b = 3 cada.
  const result = planDistribution({ leads: leads(['a', 'a', 'a', 'a', 'x', 'x']), targets: ['a', 'b'], mode: 'equal_split' });
  assert.equal(result.shares.a, 3);
  assert.equal(result.shares.b, 3);
  // Só 1 da Ana sai, e os 2 do antigo saem: 3 mudanças.
  assert.equal(result.changes.length, 3);
  assert.equal(countTo(result.changes, 'b'), 3);
  assert.equal(result.changes.filter((change) => change.from === 'a').length, 1);
});

test('equilibrar o total dá mais para quem tem menos', () => {
  // a já tem 10 fora da seleção, b tem 0; 10 leads novos: b recebe todos.
  const result = planDistribution({ leads: leads(Array(10).fill(null)), targets: ['a', 'b'], mode: 'balance_totals', base: { a: 10, b: 0 } });
  assert.equal(countTo(result.changes, 'b'), 10);
  assert.equal(countTo(result.changes, 'a'), 0);
});

test('sem leads ou sem destino, nada muda', () => {
  assert.equal(planDistribution({ leads: [], targets: ['a'], mode: 'equal_split' }).changes.length, 0);
  assert.equal(planDistribution({ leads: leads([null]), targets: [], mode: 'equal_split' }).changes.length, 0);
});

test('já distribuído do jeito pedido: nenhuma mudança', () => {
  const result = planDistribution({ leads: leads(['a', 'b', 'a', 'b']), targets: ['a', 'b'], mode: 'equal_split' });
  assert.equal(result.changes.length, 0);
});

test('nomes: exato, sem acento, primeiro nome único; ambíguo não escolhe ninguém', () => {
  const people = [{ name: 'Maria José' }, { name: 'João Pedro' }, { name: 'Maria Clara' }];
  assert.equal(findByName('joao', people)?.name, 'João Pedro');
  assert.equal(findByName('MARIA JOSE', people)?.name, 'Maria José');
  assert.equal(findByName('Maria', people), null);
  assert.equal(findByName('Carlos', people), null);
});

test('o plano da IA e o plano confirmado têm formato fechado', () => {
  assert.equal(leadAssistantPlanSchema.safeParse({ action: 'delete' }).success, false);
  const ok = resolvedLeadAssistantPlanSchema.safeParse({
    scope: 'unassigned', mode: 'equal_split', fromUserIds: [], toUserIds: ['u1'], stageIds: [], stageName: null, source: null, tag: null, limit: null,
  });
  assert.equal(ok.success, true);
  const noTarget = resolvedLeadAssistantPlanSchema.safeParse({
    scope: 'unassigned', mode: 'equal_split', fromUserIds: [], toUserIds: [], stageIds: [], stageName: null, source: null, tag: null, limit: null,
  });
  assert.equal(noTarget.success, false);
});

test('a prévia diz em palavras simples quais leads entram', () => {
  assert.equal(
    describeScope({ scope: 'from_attendants', stageName: 'Novo', source: null, tag: null, limit: 30 }, ['Ana', 'Bia']),
    'leads em aberto de Ana e Bia na etapa "Novo" (no máximo 30, os mais antigos primeiro)',
  );
});

test('a barra do Flip reconhece comandos sobre leads e deixa as perguntas para o Pergunte ao Flip', () => {
  const commands = [
    'distribua todos os leads de igual modo para os novos atendentes',
    'Passe os leads da Maria para o João',
    'redistribua a carteira da Ana',
    'equilibre os leads entre os atendentes',
    'desfaça a última distribuição',
    'Quantos leads cada atendente tem?',
  ];
  for (const text of commands) assert.equal(looksLikeLeadCommand(text), true, text);
  const questions = [
    'Quantos leads tivemos este mês?',
    'Como está o time de atendimento?',
    'De onde vieram os leads da semana passada?',
    'Quantos leads fecharam nos últimos 30 dias?',
    'O que aconteceu na semana passada?',
  ];
  for (const text of questions) assert.equal(looksLikeLeadCommand(text), false, text);
});
