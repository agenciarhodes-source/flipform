import assert from 'node:assert/strict';
import test from 'node:test';

import { detectAudioFormat, opusPacketSamples, prepareVoiceNote, readWebmOpus } from '../lib/audio/voice-note';

function vint(value: number) {
  // 8-byte size, enough for tests
  const out = [0x01, 0, 0, 0, 0, 0, 0, 0];
  let v = value;
  for (let i = 7; i > 0; i -= 1) { out[i] = v % 256; v = Math.floor(v / 256); }
  return out;
}
function el(id: number[], body: number[]) { return [...id, ...vint(body.length), ...body]; }
const UNKNOWN = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
const ascii = (s: string) => Array.from(new TextEncoder().encode(s));

/** A minimal Chrome-like WebM: unknown-size Segment and Cluster, Opus track, SimpleBlocks. */
function fakeWebm(packets: number[][]) {
  const head = [...ascii('OpusHead'), 1, 1, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0];
  const track = el([0xae], [...el([0x86], ascii('A_OPUS')), ...el([0x63, 0xa2], head), ...el([0xe1], el([0x9f], [1]))]);
  const tracks = el([0x16, 0x54, 0xae, 0x6b], track);
  const blocks = packets.flatMap((packet, index) => el([0xa3], [0x81, 0, index * 20, 0x80, ...packet]));
  const cluster = [0x1f, 0x43, 0xb6, 0x75, ...UNKNOWN, ...el([0xe7], [0]), ...blocks];
  const header = el([0x1a, 0x45, 0xdf, 0xa3], el([0x42, 0x82], ascii('webm')));
  return new Uint8Array([...header, 0x18, 0x53, 0x80, 0x67, ...UNKNOWN, ...tracks, ...cluster]);
}

test('Opus: amostras por pacote pelo byte TOC', () => {
  assert.equal(opusPacketSamples(new Uint8Array([31 << 3])), 960); // CELT 20 ms
  assert.equal(opusPacketSamples(new Uint8Array([(1 << 3) | 1])), 1920); // SILK 20 ms, 2 frames
  assert.equal(opusPacketSamples(new Uint8Array([(31 << 3) | 3, 3])), 2880);
});

test('lê os pacotes Opus de um WebM do Chrome (tamanho desconhecido)', () => {
  const webm = readWebmOpus(fakeWebm([[31 << 3, 1, 2], [31 << 3, 3, 4, 5]]));
  assert.equal(webm.codecId, 'A_OPUS');
  assert.equal(webm.packets.length, 2);
  assert.deepEqual(Array.from(webm.packets[1]), [31 << 3, 3, 4, 5]);
});

test('WebM vira OGG/Opus de voz, com cabeçalhos e posição final certos', () => {
  const packets = Array.from({ length: 120 }, (_, i) => [31 << 3, i % 256, 7, 7, 7]);
  const result = prepareVoiceNote(fakeWebm(packets));
  assert.equal(result.mimeType, 'audio/ogg');
  assert.equal(result.voice, true);
  assert.equal(detectAudioFormat(result.bytes), 'ogg');
  const text = new TextDecoder('latin1').decode(result.bytes);
  assert.ok(text.includes('OpusHead') && text.includes('OpusTags'));
  // Last page: EOS flag and granule = 120 packets x 960 samples.
  const last = text.lastIndexOf('OggS');
  assert.equal(result.bytes[last + 5] & 0x04, 0x04);
  const view = new DataView(result.bytes.buffer, result.bytes.byteOffset + last);
  assert.equal(view.getUint32(6, true), 120 * 960);
});

test('outros formatos passam direto ou são recusados', () => {
  const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
  assert.equal(prepareVoiceNote(mp4).mimeType, 'audio/mp4');
  assert.throws(() => prepareVoiceNote(new Uint8Array(20)));
});
