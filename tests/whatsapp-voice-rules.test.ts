import test from 'node:test';
import assert from 'node:assert/strict';
import { isOggOpus, shouldSendVoice, speechTextFromReply, whatsappVoiceSettingsSchema } from '../lib/whatsapp-ai/voice-rules';

const reply = 'Recebi os seus documentos, obrigada! Agora o nosso time vai avaliar o seu caso.';

test('voice: off never; test only the test numbers; on request only who asked; auto also long texts', () => {
  assert.equal(shouldSendVoice({ mode: 'off', testNumber: true, prefersAudio: true, reply }), false);
  assert.equal(shouldSendVoice({ mode: 'test', testNumber: true, prefersAudio: false, reply }), true);
  assert.equal(shouldSendVoice({ mode: 'test', testNumber: false, prefersAudio: true, reply }), false);
  assert.equal(shouldSendVoice({ mode: 'on_request', testNumber: false, prefersAudio: true, reply }), true);
  assert.equal(shouldSendVoice({ mode: 'on_request', testNumber: true, prefersAudio: false, reply }), false);
  assert.equal(shouldSendVoice({ mode: 'auto', testNumber: false, prefersAudio: false, reply: 'a'.repeat(500) }), true);
  assert.equal(shouldSendVoice({ mode: 'auto', testNumber: false, prefersAudio: false, reply }), false);
});

test('voice: links, long numbers and very long texts go as text', () => {
  assert.equal(shouldSendVoice({ mode: 'test', testNumber: true, prefersAudio: false, reply: 'Acesse https://gov.br agora' }), false);
  assert.equal(shouldSendVoice({ mode: 'test', testNumber: true, prefersAudio: false, reply: 'O protocolo é 123456789' }), false);
  assert.equal(shouldSendVoice({ mode: 'test', testNumber: true, prefersAudio: false, reply: 'a'.repeat(1000) }), false);
  assert.equal(shouldSendVoice({ mode: 'test', testNumber: true, prefersAudio: false, reply: '   ' }), false);
});

test('spoken text: no WhatsApp marks or emoji, line breaks become pauses', () => {
  assert.equal(speechTextFromReply('Oi, *Maria*! 😊\nTudo certo.'), 'Oi, Maria! Tudo certo.');
  assert.equal(speechTextFromReply('Recebi seu RG\nAgora falta o CPF'), 'Recebi seu RG. Agora falta o CPF');
});

test('settings: ElevenLabs needs the voice ID; off needs nothing', () => {
  assert.equal(whatsappVoiceSettingsSchema.safeParse({ mode: 'test', provider: 'elevenlabs', voiceId: '' }).success, false);
  assert.equal(whatsappVoiceSettingsSchema.safeParse({ mode: 'test', provider: 'elevenlabs', voiceId: '21m00Tcm4TlvDq8ikWAM' }).success, true);
  assert.equal(whatsappVoiceSettingsSchema.safeParse({ mode: 'off', provider: 'elevenlabs', voiceId: '' }).success, true);
  assert.equal(whatsappVoiceSettingsSchema.safeParse({ mode: 'test', provider: 'openai', voiceId: 'marin' }).success, true);
  assert.equal(whatsappVoiceSettingsSchema.safeParse({ mode: 'test', provider: 'elevenlabs', voiceId: 'id com espaço!' }).success, false);
});

test('Ogg/Opus is recognised by its header', () => {
  assert.equal(isOggOpus(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 2])), true);
  assert.equal(isOggOpus(new Uint8Array([0x49, 0x44, 0x33, 0x04, 0])), false);
});
