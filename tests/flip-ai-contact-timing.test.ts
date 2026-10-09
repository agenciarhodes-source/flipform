import assert from 'node:assert/strict';
import test from 'node:test';

import { isContactRequest, resolveContactMoment, summarizeContactRequests } from '../lib/flip-ai/contact-timing';
import type { FlipAiConversationDecision } from '../lib/flip-ai/decision-engine';

const base: FlipAiConversationDecision = {
  engine: 'jev', engineVersion: 'test', model: 'jev-test', intent: 'information', objection: 'none',
  journeyStage: 'discovery', nextAction: 'answer_directly', fitScore: 60, intentScore: 40, urgencyScore: 30,
  readinessScore: 30, needsHuman: false, confidence: 0.8, intentConfidence: 0.8, objectionConfidence: 0.8,
  stageConfidence: 0.8,
};

test('reconhece pedidos de contato e ignora menções comuns', () => {
  assert.equal(isContactRequest('Faz sentido. Como você se chama?'), true);
  assert.equal(isContactRequest('Para eu encaminhar, qual seu nome e telefone?'), true);
  assert.equal(isContactRequest('Pode me passar seu WhatsApp?'), true);
  assert.equal(isContactRequest('Atendemos por telefone e WhatsApp.'), false);
  assert.equal(isContactRequest('Qual é o seu objetivo com os anúncios?'), false);
  assert.deepEqual(summarizeContactRequests(['Oi!', 'Como você se chama?', 'Entendi.']),
    { requests: 1, repliesSinceLastRequest: 1 });
});

test('não repete o pedido logo depois de pedir e para após três tentativas', () => {
  const ready = { ...base, journeyStage: 'decision' as const, intentScore: 90 };
  assert.equal(resolveContactMoment({ inboundMessages: 4, decision: ready,
    assistantMessages: ['Sim, fazemos. Como você se chama?'] }), 'hold_after_request');
  assert.equal(resolveContactMoment({ inboundMessages: 6, decision: ready,
    assistantMessages: ['Como você se chama?', 'Explico.', 'Claro, funciona assim.'] }), 'ask_now');
  assert.equal(resolveContactMoment({ inboundMessages: 9, decision: ready,
    assistantMessages: ['Como você se chama?', 'a', 'b', 'Qual seu nome?', 'c', 'd', 'Qual seu telefone?', 'e', 'f'] }),
  'stop_requesting');
});

test('usa a leitura do momento para decidir a hora de pedir o contato', () => {
  assert.equal(resolveContactMoment({ inboundMessages: 2, decision: base }), 'discover_first');
  assert.equal(resolveContactMoment({ inboundMessages: 2, decision: { ...base, journeyStage: 'consideration' } }), 'ask_now');
  assert.equal(resolveContactMoment({ inboundMessages: 1, decision: { ...base, journeyStage: 'decision' } }), 'discover_first');
  assert.equal(resolveContactMoment({ inboundMessages: 4,
    decision: { ...base, intent: 'objection', objection: 'price', journeyStage: 'decision' } }), 'handle_objection_first');
  // A question about price is not an objection, whatever topic and confidence the engine attaches.
  assert.equal(resolveContactMoment({ inboundMessages: 4,
    decision: { ...base, intent: 'information', objection: 'price', objectionConfidence: 0.9, journeyStage: 'decision' } }), 'ask_now');
  assert.equal(resolveContactMoment({ inboundMessages: 5, decision: base }), 'ask_now');
  // A low engine fit never declares the person out of profile: only the attendant judges that.
  assert.equal(resolveContactMoment({ inboundMessages: 1, decision: { ...base, fitScore: 6 } }), 'discover_first');
  assert.equal(resolveContactMoment({ inboundMessages: 5, decision: { ...base, fitScore: 10 } }), 'ask_now');
});

test('sem leitura do JEV mantém a regra simples por quantidade de mensagens', () => {
  assert.equal(resolveContactMoment({ inboundMessages: 2 }), 'discover_first');
  assert.equal(resolveContactMoment({ inboundMessages: 3 }), 'ask_now');
});
