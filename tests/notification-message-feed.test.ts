import assert from 'node:assert/strict';
import test from 'node:test';

import { messagePreview } from '../lib/notifications/message-feed';

test('a prévia mostra o texto ou o tipo da mensagem', () => {
  assert.equal(messagePreview('text', '  Oi,   tudo bem? '), 'Oi, tudo bem?');
  assert.equal(messagePreview('audio', null), 'Mensagem de voz');
  assert.equal(messagePreview('image', ''), 'Foto');
  assert.equal(messagePreview('unknown', null), 'Nova mensagem');
  assert.equal(messagePreview('text', 'a'.repeat(120)).length, 90);
});
