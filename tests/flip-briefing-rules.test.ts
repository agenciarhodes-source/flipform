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

test('o resumo completo traz origem, canais, vendas e o mês comparado', () => {
  const text = plainBriefing({
    ...facts,
    yesterday: {
      ...facts.yesterday,
      sources: [{ source: 'google_ads', leads: 12 }, { source: 'meta', leads: 7 }],
      channels: [{ channel: 'WhatsApp', conversations: 31 }, { channel: 'Instagram', conversations: 6 }],
      sales: { count: 2, total: 'R$ 3.200,00' },
    },
    month: { leads: 410, closed: 21, lastMonthLeads: 380, lastMonthClosed: 18 },
  });
  assert.match(text, /Origem dos leads de ontem: google_ads \(12\), meta \(7\)\./);
  assert.match(text, /Conversas com clientes ontem: WhatsApp 31, Instagram 6\./);
  assert.match(text, /Vendas registradas ontem: 2 \(R\$ 3\.200,00\)\./);
  assert.match(text, /No mês até agora: 410 leads e 21 fechamentos \(no mesmo ponto do mês passado: 380 e 18\)\./);
});
