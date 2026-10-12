import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FLIP_AI_AUDIO_REPLY_MIN_CHARACTERS,
  audioModeNote,
  resolveAudioMode,
  prefersAudioReplies,
  shouldReplyWithAudio,
} from '../lib/flip-ai/audio-reply';
import { OpenAiSpeechError, resolveSpeechVoice, synthesizeReplySpeech } from '../lib/flip-ai/openai-speech';

test('resposta curta fica em texto e explicação longa vira áudio', () => {
  assert.equal(shouldReplyWithAudio({ reply: 'Sim, fazemos gestão de tráfego.' }), false);
  assert.equal(shouldReplyWithAudio({ reply: 'a'.repeat(FLIP_AI_AUDIO_REPLY_MIN_CHARACTERS) }), false);
  assert.equal(shouldReplyWithAudio({ reply: 'a'.repeat(FLIP_AI_AUDIO_REPLY_MIN_CHARACTERS + 1) }), true);
  assert.equal(shouldReplyWithAudio({ reply: '   ' }), false);
});

test('quem pediu áudio recebe áudio até pedir texto de novo', () => {
  const asked = [{ action: 'upsert' as const, key: 'prefere_audio', value: 'sim' }];
  assert.equal(shouldReplyWithAudio({ reply: 'Claro.', patchFacts: asked }), true);
  assert.equal(shouldReplyWithAudio({ reply: 'Claro.', storedFacts: [{ key: 'prefere_audio', value: 'sim' }] }), true);
  const backToText = [{ action: 'remove' as const, key: 'prefere_audio', value: null }];
  assert.equal(prefersAudioReplies([{ key: 'prefere_audio', value: 'sim' }], backToText), false);
  assert.equal(prefersAudioReplies([{ key: 'cidade', value: 'sim' }]), false);
  assert.equal(prefersAudioReplies([{ key: 'prefere_audio', value: 'não' }]), false);
});

test('voz desconhecida cai na padrão e a fala usa só o texto aprovado', async () => {
  assert.equal(resolveSpeechVoice('CORAL'), 'coral');
  assert.equal(resolveSpeechVoice('voz-inexistente'), 'marin');
  let sent: Record<string, unknown> = {};
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }) as typeof fetch;
  const speech = await synthesizeReplySpeech({ text: '**Olá!** Veja [o site](https://exemplo.com).', voice: 'cedar', apiKey: 'key', fetchImpl });
  assert.equal(speech.contentType, 'audio/mpeg');
  assert.equal(speech.audio.byteLength, 3);
  assert.equal(sent.voice, 'cedar');
  assert.equal(sent.response_format, 'mp3');
  assert.equal(sent.input, 'Olá! Veja o site.');
});

test('falha do provedor de voz vira erro tratável, sem nova tentativa', async () => {
  let calls = 0;
  const failing = (async () => { calls += 1; return new Response('{}', { status: 500 }); }) as typeof fetch;
  await assert.rejects(
    synthesizeReplySpeech({ text: 'Olá', apiKey: 'key', fetchImpl: failing }),
    (error: unknown) => error instanceof OpenAiSpeechError && error.code === 'OPENAI_SPEECH_HTTP_500',
  );
  assert.equal(calls, 1);
});

test('a empresa decide quando o atendente pode responder em áudio', () => {
  const long = 'a'.repeat(FLIP_AI_AUDIO_REPLY_MIN_CHARACTERS + 1);
  const asked = [{ key: 'prefere_audio', value: 'sim' }];
  assert.equal(shouldReplyWithAudio({ reply: long, mode: 'auto' }), true);
  assert.equal(shouldReplyWithAudio({ reply: long, mode: 'on_request' }), false);
  assert.equal(shouldReplyWithAudio({ reply: 'Claro.', storedFacts: asked, mode: 'on_request' }), true);
  assert.equal(shouldReplyWithAudio({ reply: long, storedFacts: asked, mode: 'never' }), false);
  assert.equal(resolveAudioMode('valor-estranho'), 'auto');
  assert.equal(audioModeNote('auto'), '');
  assert.match(audioModeNote('never'), /não há respostas em áudio/);
  assert.match(audioModeNote('on_request'), /quando a própria pessoa pedir/);
});
