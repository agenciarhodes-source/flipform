import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decideWhatsAppAiAnswer,
  isTestPhoneNumber,
  isWithinBusinessHours,
  toWhatsAppText,
  withWhatsAppSourceLinks,
  nameFromReply,
  type WhatsAppAiRuleSettings,
} from '../lib/whatsapp-ai/eligibility';

const base: WhatsAppAiRuleSettings = {
  enabled: true,
  agentId: 'agent-1',
  scheduleMode: 'always',
  businessHours: { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' },
  liveEnabled: false,
  testPhoneNumbers: ['(86) 99805-2597'],
};
// Monday 2026-10-19, 10:00 in Brasília (13:00 UTC).
const mondayMorning = new Date('2026-10-19T13:00:00Z');
// Monday 2026-10-19, 21:00 in Brasília.
const mondayNight = new Date('2026-10-20T00:00:00Z');

test('um número de teste é reconhecido com ou sem 55 e com ou sem o 9 extra', () => {
  assert.equal(isTestPhoneNumber(['86998052597'], '5586998052597'), true);
  assert.equal(isTestPhoneNumber(['86998052597'], '558698052597'), true);
  assert.equal(isTestPhoneNumber(['+55 (86) 9805-2597'], '5586998052597'), true);
  assert.equal(isTestPhoneNumber(['86998052597'], '5586998052598'), false);
  assert.equal(isTestPhoneNumber([], '5586998052597'), false);
});

test('a IA só responde aos números de teste até ser liberada para todos', () => {
  const customer = '5586911112222';
  assert.deepEqual(decideWhatsAppAiAnswer({ settings: base, customerWaId: customer, now: mondayMorning, trigger: 'message' }),
    { answer: false, reason: 'not_test_number' });
  assert.deepEqual(decideWhatsAppAiAnswer({ settings: base, customerWaId: '5586998052597', now: mondayMorning, trigger: 'message' }),
    { answer: true });
  assert.deepEqual(decideWhatsAppAiAnswer({ settings: { ...base, liveEnabled: true }, customerWaId: customer, now: mondayMorning, trigger: 'message' }),
    { answer: true });
});

test('desligada ou sem agente, a IA nunca responde', () => {
  assert.deepEqual(decideWhatsAppAiAnswer({ settings: { ...base, enabled: false, liveEnabled: true }, customerWaId: '1', now: mondayMorning, trigger: 'message' }),
    { answer: false, reason: 'disabled' });
  assert.deepEqual(decideWhatsAppAiAnswer({ settings: { ...base, agentId: null, liveEnabled: true }, customerWaId: '1', now: mondayMorning, trigger: 'message' }),
    { answer: false, reason: 'no_agent' });
});

test('"só fora do expediente" deixa o horário comercial com a equipe', () => {
  const settings = { ...base, liveEnabled: true, scheduleMode: 'outside_hours' };
  assert.equal(isWithinBusinessHours(base.businessHours!, mondayMorning), true);
  assert.equal(isWithinBusinessHours(base.businessHours!, mondayNight), false);
  assert.deepEqual(decideWhatsAppAiAnswer({ settings, customerWaId: '1', now: mondayMorning, trigger: 'message' }),
    { answer: false, reason: 'business_hours' });
  assert.deepEqual(decideWhatsAppAiAnswer({ settings, customerWaId: '1', now: mondayNight, trigger: 'message' }), { answer: true });
});

test('"quando ninguém responder" não responde na hora; só a varredura responde', () => {
  const settings = { ...base, liveEnabled: true, scheduleMode: 'no_reply' };
  assert.deepEqual(decideWhatsAppAiAnswer({ settings, customerWaId: '1', now: mondayMorning, trigger: 'message' }),
    { answer: false, reason: 'waits_for_team' });
  assert.deepEqual(decideWhatsAppAiAnswer({ settings, customerWaId: '1', now: mondayMorning, trigger: 'no_reply_sweep' }), { answer: true });
});

test('o texto sai no formato do WhatsApp', () => {
  assert.equal(toWhatsAppText('## Olá\n\nSeu **caso** tem solução.\n\n\n\nVamos?'), 'Olá\n\nSeu *caso* tem solução.\n\nVamos?');
});

test('no WhatsApp, a marca de fonte externa vira o link no final', () => {
  const sources = [{ url: 'https://www.gov.br/inss/pt-br/a' }, { url: 'https://www.planalto.gov.br/b' }];
  assert.equal(withWhatsAppSourceLinks('O BPC é de um salário mínimo [Fonte externa 1].', sources),
    'O BPC é de um salário mínimo.\n\nFonte: https://www.gov.br/inss/pt-br/a');
  assert.equal(withWhatsAppSourceLinks('Texto [Fontes externas 1 e 2] fim.', sources),
    'Texto fim.\n\nFonte: https://www.gov.br/inss/pt-br/a\nhttps://www.planalto.gov.br/b');
  assert.equal(withWhatsAppSourceLinks('Sem fonte.', sources), 'Sem fonte.');
  assert.equal(withWhatsAppSourceLinks('Fonte inexistente [Fonte externa 9].', sources), 'Fonte inexistente.');
});

test('o nome é lido da resposta quando a IA perguntou como chamar', () => {
  const ask = 'Para identificar o atendimento, como você prefere ser chamado?';
  assert.equal(nameFromReply(ask, 'Diego', null), 'Diego');
  assert.equal(nameFromReply(ask, 'pode me chamar de maria das dores', null), 'Maria Das Dores');
  assert.equal(nameFromReply(ask, 'me chamo João.', null), 'João');
  assert.equal(nameFromReply(ask, 'sou Diego', null), 'Diego');
  assert.equal(nameFromReply(ask, 'sou a Ana Paula', null), 'Ana Paula');
  assert.equal(nameFromReply('Posso te chamar de Diego?', 'sim', 'Diego'), 'Diego');
  assert.equal(nameFromReply('Posso te chamar de Diego?', 'pode', 'Diego'), 'Diego');
  assert.equal(nameFromReply(ask, 'quero saber do meu benefício que foi negado ontem pelo inss', null), null);
  assert.equal(nameFromReply(ask, '2000', null), null);
  assert.equal(nameFromReply(ask, 'obrigado', null), null);
  assert.equal(nameFromReply('Quantas pessoas moram na casa?', 'Diego', null), null);
  assert.equal(nameFromReply(null, 'Diego', null), null);
});
