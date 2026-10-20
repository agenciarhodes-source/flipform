import assert from 'node:assert/strict';
import test from 'node:test';

import { brasiliaDayAndHour, greetingName, plainBriefing, type BriefingFacts } from '../lib/flip/briefing-rules';

const facts: BriefingFacts = {
  seesTeam: true,
  firstName: 'Mônica',
  yesterday: { newLeads: 23, aiLeads: 8, closed: 3 },
  today: { unanswered: 4, overdueTasks: 1, hotWithoutTask: 0, newWithoutContact: 0, stale: 2, stageSuggestions: 5, overloaded: [{ name: 'Clarice', detail: '18 leads em aberto (média da equipe: 9)' }] },
  firstPriority: { title: 'João', detail: 'Escreveu há 2 h e ainda não teve resposta' },
};

test('o resumo simples usa só os números', () => {
  const text = plainBriefing(facts);
  assert.match(text, /Ontem: 23 leads novos \(8 pela IA no WhatsApp\) e 3 fechamentos\./);
  assert.match(text, /4 conversas sem resposta, 1 retorno atrasado, 5 sugestões de etapa para aprovar, 2 leads parados/);
  assert.match(text, /Clarice/);
  assert.match(text, /Comece por: João/);
});

test('atendente sem pendências não vê a distribuição da equipe', () => {
  const text = plainBriefing({ ...facts, seesTeam: false, today: { ...facts.today, unanswered: 0, overdueTasks: 0, stale: 0, stageSuggestions: 0 }, firstPriority: null });
  assert.match(text, /Hoje não há pendências/);
  assert.doesNotMatch(text, /Clarice/);
});

test('o dia e a hora são os de Brasília', () => {
  assert.deepEqual(brasiliaDayAndHour(new Date('2026-10-21T02:30:00Z')), { day: '2026-10-20', hour: 23 });
  assert.deepEqual(brasiliaDayAndHour(new Date('2026-10-21T10:00:00Z')), { day: '2026-10-21', hour: 7 });
});

test('saudação só com nome de verdade', () => {
  assert.equal(greetingName('Mônica Souza'), 'Mônica');
  assert.equal(greetingName('marketing.junqueiraadvogados'), '');
  assert.equal(greetingName('joao@empresa.com'), '');
  assert.equal(greetingName('user_123'), '');
  assert.equal(greetingName('clarice'), 'Clarice');
  assert.equal(greetingName(''), '');
});
