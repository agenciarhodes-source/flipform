import assert from 'node:assert/strict';
import test from 'node:test';

import { estimateSpeechUsage, resolveTranscriptionUsage } from '../lib/flip-ai/audio-usage-policy';
import { estimateOpenAiUsageCost } from '../lib/flip-ai/openai-pricing';

function credits(model: string, operation: string, usage: { inputTokens: number; outputTokens: number }) {
  const estimate = estimateOpenAiUsageCost({ operation, model, confirmedEvents: 1, ...usage });
  assert.equal(estimate.coverage, 'full');
  return Math.ceil(estimate.costNanoUsd / 1_000);
}

test('resposta em áudio é cobrada pelo tamanho do texto falado', () => {
  const usage = estimateSpeechUsage(420);
  assert.deepEqual(usage, { inputTokens: 205, outputTokens: 630, seconds: 30, estimated: true });
  // 205 * 0,6 + 630 * 12 = 7.683 créditos: perto de US$ 0,015 por minuto de voz.
  assert.equal(credits('gpt-4o-mini-tts', 'voice_speech', usage), 7_683);
  assert.deepEqual(estimateSpeechUsage(0), { inputTokens: 0, outputTokens: 0, seconds: 0, estimated: true });
  assert.equal(estimateSpeechUsage(5).seconds, 1);
});

test('áudio recebido usa o consumo informado pelo provedor e estima quando ele não vem', () => {
  const reported = resolveTranscriptionUsage({ reported: { inputTokens: 300, outputTokens: 80 }, transcriptCharacters: 420 });
  assert.deepEqual(reported, { inputTokens: 300, outputTokens: 80, seconds: 30, estimated: false });
  // 300 * 3 + 80 * 5 = 1.300 créditos.
  assert.equal(credits('gpt-4o-mini-transcribe', 'voice_transcription', reported), 1_300);

  const estimated = resolveTranscriptionUsage({ reported: null, transcriptCharacters: 420 });
  assert.deepEqual(estimated, { inputTokens: 300, outputTokens: 105, seconds: 30, estimated: true });
  // Um minuto de fala estimado fica perto de US$ 0,003: 600 * 3 + 210 * 5 = 2.850 créditos.
  assert.equal(credits('gpt-4o-mini-transcribe', 'voice_transcription',
    resolveTranscriptionUsage({ transcriptCharacters: 840 })), 2_850);
  // Números inválidos do provedor nunca viram cobrança negativa nem quebrada.
  assert.equal(resolveTranscriptionUsage({ reported: { inputTokens: -5, outputTokens: 'x' }, transcriptCharacters: 14 }).estimated, true);
});
