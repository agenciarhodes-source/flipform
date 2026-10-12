import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenAiTranscriptionError, transcribeVoiceNote } from '../lib/flip-ai/openai-transcription';

const audio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);

test('áudio vira texto em uma única chamada, em português', async () => {
  const calls: Array<{ url: string; form: FormData; authorization: string | null }> = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({
      url: String(url),
      form: init?.body as FormData,
      authorization: new Headers(init?.headers).get('authorization'),
    });
    return new Response(JSON.stringify({ text: '  Quero   saber o preço.  ' }), { status: 200 });
  }) as typeof fetch;
  const result = await transcribeVoiceNote({ bytes: audio, mimeType: 'audio/webm', apiKey: 'key', fetchImpl });
  assert.equal(result.text, 'Quero saber o preço.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(calls[0]?.authorization, 'Bearer key');
  assert.equal(calls[0]?.form.get('language'), 'pt');
  const file = calls[0]?.form.get('file');
  assert.ok(file instanceof Blob);
  if (file instanceof File) assert.equal(file.name, 'audio.webm');
});

test('falha do provedor e formato não aceito viram erro tratável, sem nova tentativa', async () => {
  let calls = 0;
  const failing = (async () => { calls += 1; return new Response('{}', { status: 500 }); }) as typeof fetch;
  await assert.rejects(
    transcribeVoiceNote({ bytes: audio, mimeType: 'audio/webm', apiKey: 'key', fetchImpl: failing }),
    (error: unknown) => error instanceof OpenAiTranscriptionError && error.code === 'OPENAI_TRANSCRIPTION_HTTP_500',
  );
  assert.equal(calls, 1);
  await assert.rejects(
    transcribeVoiceNote({ bytes: audio, mimeType: 'video/quicktime', apiKey: 'key', fetchImpl: failing }),
    (error: unknown) => error instanceof OpenAiTranscriptionError && error.code === 'OPENAI_TRANSCRIPTION_UNSUPPORTED_AUDIO',
  );
  assert.equal(calls, 1);
});

test('áudio sem fala devolve texto vazio para o chat pedir nova gravação', async () => {
  const silent = (async () => new Response(JSON.stringify({ text: '   ' }), { status: 200 })) as typeof fetch;
  assert.equal((await transcribeVoiceNote({ bytes: audio, mimeType: 'audio/webm', apiKey: 'key', fetchImpl: silent })).text, '');
});
