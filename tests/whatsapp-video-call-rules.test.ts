import assert from 'node:assert/strict';
import test from 'node:test';

import { customerAsksVideoCall, extractVideoCall, VIDEO_CALL_INSTRUCTION, videoCallTask } from '../lib/whatsapp-ai/video-call-rules';

test('reconhece o pedido de chamada de vídeo do cliente', () => {
  for (const text of [
    'Pode fazer uma chamada de vídeo?',
    'prefiro video chamada',
    'Quero uma videochamada com o advogado',
    'me liga por vídeo',
    'Dá pra ligar por video?',
    'Podemos falar por vídeo?',
    'ligação de vídeo agora pode ser',
  ]) {
    assert.equal(customerAsksVideoCall(text), true, text);
  }
});

test('recusa ou assunto parecido não é pedido', () => {
  for (const text of [
    'Não quero chamada de vídeo',
    'nao precisa de video chamada',
    'sem vídeo por favor',
    'Vi o vídeo de vocês no Instagram',
    'mandei o vídeo do documento',
    '',
  ]) {
    assert.equal(customerAsksVideoCall(text), false, text);
  }
  assert.equal(customerAsksVideoCall(null), false);
});

test('a marca da IA sai da resposta e indica a passagem para a atendente', () => {
  const marked = extractVideoCall('Perfeito! Nossa atendente vai te chamar por vídeo em instantes.\n[CHAMADA_VIDEO]');
  assert.deepEqual(marked, { reply: 'Perfeito! Nossa atendente vai te chamar por vídeo em instantes.', requested: true });
  assert.equal(extractVideoCall('Olá! [chamada vídeo]').requested, true);
  assert.deepEqual(extractVideoCall('Tudo bem?'), { reply: 'Tudo bem?', requested: false });
});

test('tarefa urgente com os links da conversa e do lead', () => {
  const task = videoCallTask({ customerName: 'Ingrid', conversationId: 'c-1', leadId: 'l-1', appUrl: 'https://app.flipform.com.br/' });
  assert.equal(task.title, 'URGENTE · Chamada de vídeo: Ingrid');
  assert.match(task.description, /Ligue por vídeo agora/);
  assert.match(task.description, /https:\/\/app\.flipform\.com\.br\/inbox\?conversationId=c-1/);
  assert.match(task.description, /leads\?leadId=l-1/);
  assert.doesNotMatch(videoCallTask({ customerName: 'X', conversationId: 'c', leadId: null, appUrl: 'https://a' }).description, /Lead:/);
  assert.match(VIDEO_CALL_INSTRUCTION, /\[CHAMADA_VIDEO\]/);
});
