import assert from 'node:assert/strict';
import test from 'node:test';

import { historyContent, isTeamMessage, messageTranscript } from '../lib/flip-ai/history-content';

test('o áudio entra no histórico pela transcrição', () => {
  assert.equal(historyContent({ type: 'audio', text: null, metadata: { transcript: ' Moro na fazenda com meu esposo. ' } }),
    '[Áudio] Moro na fazenda com meu esposo.');
  assert.equal(historyContent({ type: 'audio', text: '🎤 Áudio', metadata: {} }), null);
  assert.equal(historyContent({ type: 'audio', text: null, metadata: null }), null);
});

test('texto continua igual', () => {
  assert.equal(historyContent({ type: 'text', text: ' Já ganhei o bebê ', metadata: null }), 'Já ganhei o bebê');
  assert.equal(historyContent({ type: 'text', text: '  ', metadata: null }), null);
});

test('a transcrição guardada é lida da mensagem', () => {
  assert.equal(messageTranscript({ transcript: 'oi' }), 'oi');
  assert.equal(messageTranscript({ transcript: '' }), null);
  assert.equal(messageTranscript([]), null);
});

test('o que a equipe disse é marcado, o que a IA disse não', () => {
  const team = { type: 'audio', text: null, metadata: { businessAppEcho: true, transcript: 'Dá para pedir uma declaração ao dono da fazenda.' }, direction: 'outbound' };
  assert.equal(isTeamMessage(team), true);
  assert.equal(historyContent(team), '[Equipe] [Áudio] Dá para pedir uma declaração ao dono da fazenda.');
  assert.equal(historyContent({ type: 'text', text: 'Olá', metadata: null, direction: 'outbound', sentByUserId: 'u1' }), '[Equipe] Olá');
  assert.equal(historyContent({ type: 'text', text: 'Olá', metadata: { aiAgentId: 'a1' }, direction: 'outbound' }), 'Olá');
  assert.equal(isTeamMessage({ type: 'text', text: 'Lembrete', metadata: {}, direction: 'outbound' }), false);
  assert.equal(isTeamMessage({ type: 'text', text: 'Oi', metadata: null, direction: 'inbound', sentByUserId: null }), false);
});
