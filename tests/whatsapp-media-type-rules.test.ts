import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveMimeType, heifMimeType } from '../lib/whatsapp-ai/media-type-rules';

const box = (brand: string) => new Uint8Array([0, 0, 0, 24, ...Buffer.from(`ftyp${brand}`), 0, 0, 0, 0]);

test('HEIC and HEIF photos are recognised by their brand', () => {
  assert.equal(heifMimeType(box('heic')), 'image/heic');
  assert.equal(heifMimeType(box('mif1')), 'image/heif');
  assert.equal(heifMimeType(box('M4A ')), null);
  assert.equal(heifMimeType(new Uint8Array([0xff, 0xd8, 0xff])), null);
});

test('kept types: photos (with HEIC), PDF, audio; an "ftyp" file is audio only in an audio message', () => {
  assert.equal(archiveMimeType(box('heic'), 'document'), 'image/heic');
  assert.equal(archiveMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image'), 'image/jpeg');
  assert.equal(archiveMimeType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), 'document'), 'application/pdf');
  assert.equal(archiveMimeType(box('M4A '), 'audio'), 'audio/mp4');
  assert.equal(archiveMimeType(box('isom'), 'video'), null);
  assert.equal(archiveMimeType(box('M4A '), 'document'), null);
});
