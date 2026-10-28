import assert from 'node:assert/strict';
import test from 'node:test';

import { instagramAiMayAnswer, normalizeInstagramUsername } from '../lib/instagram-ai/rules';

test('o @ do Instagram é normalizado e o que não pode ser @ é recusado', () => {
  assert.equal(normalizeInstagramUsername('@Maria.Silva '), 'maria.silva');
  assert.equal(normalizeInstagramUsername('junqueira_adv'), 'junqueira_adv');
  for (const value of ['', '@', 'maria silva', 'maria#1', 'a'.repeat(31), null, undefined]) {
    assert.equal(normalizeInstagramUsername(value), null, String(value));
  }
});

const base = { enabled: true, agentId: 'agent-1', liveEnabled: false, testUsernames: ['maria.silva'] };

test('desligada ou sem atendente, a IA não responde', () => {
  assert.deepEqual(instagramAiMayAnswer({ ...base, enabled: false, senderUsername: 'maria.silva' }), { answer: false, reason: 'disabled' });
  assert.deepEqual(instagramAiMayAnswer({ ...base, agentId: null, senderUsername: 'maria.silva' }), { answer: false, reason: 'no_agent' });
});

test('em teste, só os perfis de teste recebem resposta', () => {
  assert.deepEqual(instagramAiMayAnswer({ ...base, senderUsername: '@Maria.Silva' }), { answer: true });
  assert.deepEqual(instagramAiMayAnswer({ ...base, senderUsername: 'outra.pessoa' }), { answer: false, reason: 'not_a_test_profile' });
  assert.deepEqual(instagramAiMayAnswer({ ...base, senderUsername: null }), { answer: false, reason: 'not_a_test_profile' });
});

test('liberada para todos, responde qualquer pessoa', () => {
  assert.deepEqual(instagramAiMayAnswer({ ...base, liveEnabled: true, senderUsername: null }), { answer: true });
});

import { instagramInstructions, INSTAGRAM_TEXT_LIMIT, toInstagramText } from '../lib/instagram-ai/rules';

test('o Direct recebe texto simples, sem formatação e dentro do limite', () => {
  assert.equal(toInstagramText('**Olá!** Veja o *link*: [WhatsApp](https://wa.me/5586999999999)'), 'Olá! Veja o link: WhatsApp: https://wa.me/5586999999999');
  assert.equal(toInstagramText('## Título\nTexto'), 'Título\nTexto');
  const long = `${'Frase curta e completa. '.repeat(60)}`;
  const cut = toInstagramText(long);
  assert.ok(cut.length <= INSTAGRAM_TEXT_LIMIT);
  assert.ok(cut.endsWith('.'));
});

test('as instruções do canal focam em entender e responder, sem pedir dados nem inventar links', () => {
  const text = instagramInstructions({ companyName: 'Empresa X', introduction: 'assistente da Empresa X', firstReply: true, firstName: null });
  assert.match(text, /entender o que a pessoa busca/);
  assert.match(text, /Nunca invente links, telefones ou endereços/);
  assert.match(text, /Não peça telefone, CPF, documentos/);
  assert.match(text, /primeira resposta/);
  assert.match(text, /Não use nenhum nome/);
  const later = instagramInstructions({ companyName: 'Empresa X', introduction: 'assistente', firstReply: false, firstName: 'Ana' });
  assert.match(later, /Não se apresente de novo/);
  assert.match(later, /"Ana"/);
  // Nothing specific to one business in the global instructions.
  for (const word of ['advogado', 'escritório', 'INSS', 'benefício']) assert.equal(text.includes(word), false, word);
});
