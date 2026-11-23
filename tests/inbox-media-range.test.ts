import assert from 'node:assert/strict';
import test from 'node:test';

import { requestedRange, SERVE_INLINE_MAX_BYTES } from '../lib/inbox/media-file-rules';

test('sem pedido de parte, o arquivo vai inteiro', () => {
  assert.equal(requestedRange(null, 1000), null);
  assert.equal(requestedRange('', 1000), null);
  assert.equal(requestedRange('items=0-5', 1000), null);
  assert.equal(requestedRange('bytes=-', 1000), null);
});

test('o player pede partes do áudio: início, meio, fim', () => {
  assert.deepEqual(requestedRange('bytes=0-', 1000), { start: 0, end: 999 });
  assert.deepEqual(requestedRange('bytes=500-', 1000), { start: 500, end: 999 });
  assert.deepEqual(requestedRange('bytes=100-199', 1000), { start: 100, end: 199 });
  assert.deepEqual(requestedRange('bytes=900-5000', 1000), { start: 900, end: 999 });
  assert.deepEqual(requestedRange('bytes=-200', 1000), { start: 800, end: 999 });
  assert.deepEqual(requestedRange('bytes=-5000', 1000), { start: 0, end: 999 });
});

test('parte fora do arquivo é recusada', () => {
  assert.equal(requestedRange('bytes=1000-', 1000), 'invalid');
  assert.equal(requestedRange('bytes=500-100', 1000), 'invalid');
  assert.equal(requestedRange('bytes=-0', 1000), 'invalid');
});

test('arquivos pequenos saem pelo FlipForm, abaixo do limite de resposta do servidor', () => {
  assert.ok(SERVE_INLINE_MAX_BYTES < 4.5 * 1024 * 1024);
});
