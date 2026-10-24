import assert from 'node:assert/strict';
import test from 'node:test';

import { historyContent, messageTranscript } from '../lib/flip-ai/history-content';

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
