import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decideWhatsAppAiAnswer,
  isTestPhoneNumber,
  isWithinBusinessHours,
  toWhatsAppText,
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
