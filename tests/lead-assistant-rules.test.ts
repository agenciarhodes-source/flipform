import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeScope, findByName, leadAssistantPlanSchema, looksLikeLeadCommand, planDistribution, planStageMoves, planTagChanges,
  resolvedLeadAssistantPlanSchema, statusForStage,
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
    action: 'distribute', scope: 'unassigned', mode: 'equal_split', fromUserIds: [], toUserIds: ['u1'], stageIds: [], stageName: null, source: null, tag: null,
    city: null, staleDays: null, limit: null, toStageName: null, tagOperation: null, tagName: null,
  });
  assert.equal(ok.success, true);
  const noTarget = resolvedLeadAssistantPlanSchema.safeParse({
    action: 'distribute', scope: 'unassigned', mode: 'equal_split', fromUserIds: [], toUserIds: [], stageIds: [], stageName: null, source: null, tag: null,
    city: null, staleDays: null, limit: null, toStageName: null, tagOperation: null, tagName: null,
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
    'Mova os leads parados há 30 dias em Não retorna para Perdido',
    'Coloque a etiqueta rural nos leads de Picos',
    'tire a etiqueta urgente dos clientes da Ana',
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

test('mudar de etapa: cada lead vai para a etapa com esse nome no próprio funil; Perdido fecha como perdido', () => {
  const target = new Map([['p1', { id: 's-lost', name: 'Perdido' }]]);
  const result = planStageMoves([
    { id: 'a', pipelineId: 'p1', stageId: 's1', status: 'open' },
    { id: 'b', pipelineId: 'p1', stageId: 's-lost', status: 'open' },
    { id: 'c', pipelineId: 'p2', stageId: 's9', status: 'open' },
  ], target);
  assert.deepEqual(result.changes, [{ leadId: 'a', fromStageId: 's1', toStageId: 's-lost', fromStatus: 'open', toStatus: 'lost' }]);
  assert.equal(result.already, 1);
  assert.equal(result.noStage, 1);
  assert.equal(statusForStage('Em andamento'), 'open');
  assert.equal(statusForStage('perdido'), 'lost');
});

test('etiquetas: coloca ou tira uma só vez, sem duplicar por maiúscula', () => {
  const leads = [{ id: 'a', tags: ['Rural'] }, { id: 'b', tags: [] }, { id: 'c', tags: ['outra'] }];
  assert.deepEqual(planTagChanges(leads, 'add', 'rural'), [
    { leadId: 'b', tags: ['rural'] },
    { leadId: 'c', tags: ['outra', 'rural'] },
  ]);
  assert.deepEqual(planTagChanges(leads, 'remove', 'RURAL'), [{ leadId: 'a', tags: [] }]);
});

test('o plano confirmado exige o que cada ação precisa', () => {
  const plan = {
    scope: 'all_open', mode: 'equal_split', fromUserIds: [], toUserIds: [], stageIds: [], stageName: null, source: null, tag: null,
    city: null, staleDays: null, limit: null, toStageName: null, tagOperation: null, tagName: null,
  };
  assert.equal(resolvedLeadAssistantPlanSchema.safeParse({ ...plan, action: 'move_stage' }).success, false);
  assert.equal(resolvedLeadAssistantPlanSchema.safeParse({ ...plan, action: 'move_stage', toStageName: 'Perdido' }).success, true);
  assert.equal(resolvedLeadAssistantPlanSchema.safeParse({ ...plan, action: 'tag', tagName: 'rural' }).success, false);
  assert.equal(resolvedLeadAssistantPlanSchema.safeParse({ ...plan, action: 'tag', tagName: 'rural', tagOperation: 'add' }).success, true);
});
