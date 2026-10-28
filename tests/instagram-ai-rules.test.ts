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
