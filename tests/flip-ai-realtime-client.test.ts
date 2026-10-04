import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildApprovedReplySpeechEvent,
  parseFlipAiRealtimeServerEvent,
} from '../lib/flip-ai/realtime-client';
import { createOpenAiRealtimeClientSecret } from '../lib/flip-ai/openai-realtime';

test('Realtime transcript parser accepts only completed, identified audio turns', () => {
  assert.deepEqual(parseFlipAiRealtimeServerEvent(JSON.stringify({
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'item_voice_1',
    transcript: '  Preciso entender o plano Premium.  ',
  })), {
    kind: 'transcript',
    itemId: 'item_voice_1',
    transcript: 'Preciso entender o plano Premium.',
  });
  assert.deepEqual(parseFlipAiRealtimeServerEvent(JSON.stringify({
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: 'item_voice_1',
    delta: 'Preciso',
  })), { kind: 'ignored' });
  assert.deepEqual(parseFlipAiRealtimeServerEvent({
    type: 'conversation.item.input_audio_transcription.failed',
    item_id: 'item_voice_1',
  }), {
    kind: 'transcription_failed',
    message: 'Não consegui transcrever esse trecho. Pode falar novamente?',
  });
  assert.deepEqual(parseFlipAiRealtimeServerEvent('{invalid'), { kind: 'ignored' });
});

test('approved backend reply is spoken out of band with humanized prosody and no business side effects', () => {
  const event = buildApprovedReplySpeechEvent(
    'turn-1',
    '**Entendi.** Vamos seguir com calma. [Fonte externa 1]',
  );
  assert.equal(event.type, 'response.create');
  assert.equal(event.response.conversation, 'none');
  assert.deepEqual(event.response.input, []);
  assert.deepEqual(event.response.output_modalities, ['audio']);
  assert.equal(event.response.tool_choice, 'none');
  assert.deepEqual(event.response.metadata, {
    flip_ai_kind: 'approved_reply',
    turn_id: 'turn-1',
  });
  assert.match(event.response.instructions, /voz humana, natural, acolhedora e profissional/);
  assert.match(event.response.instructions, /cadência conversacional/);
  assert.match(event.response.instructions, /Evite tom de locutor/);
  assert.match(event.response.instructions, /Entendi\. Vamos seguir com calma\./);
  assert.doesNotMatch(event.response.instructions, /\[Fonte externa 1\]/);
  assert.doesNotMatch(event.response.instructions, /\*\*/);
  assert.deepEqual(parseFlipAiRealtimeServerEvent({
    type: 'response.done',
    response: { status: 'completed', metadata: event.response.metadata },
  }), { kind: 'approved_reply_generated', turnId: 'turn-1' });
  assert.deepEqual(parseFlipAiRealtimeServerEvent({
    type: 'output_audio_buffer.stopped',
  }), { kind: 'audio_stopped' });
});

test('Realtime session enables Portuguese transcription but never auto-responds', async () => {
  await createOpenAiRealtimeClientSecret({
    instructions: 'Política server-side.',
    safetyIdentifier: 'conversation-private-id',
  }, {
    apiKey: 'server-only-key',
    model: 'realtime-test-model',
    now: () => 1_000_000,
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.session.audio.input.transcription, {
        model: 'gpt-4o-mini-transcribe',
        language: 'pt',
      });
      assert.deepEqual(body.session.audio.input.noise_reduction, { type: 'near_field' });
      assert.equal(body.session.audio.input.turn_detection.create_response, false);
      assert.equal(body.session.audio.input.turn_detection.interrupt_response, false);
      assert.equal(body.session.tool_choice, 'none');
      assert.deepEqual(body.session.tools, []);
      assert.equal(body.session.max_output_tokens, 1_200);
      return new Response(JSON.stringify({
        value: 'ek_test_secret_value_123456789',
        expires_at: 2_000,
      }), { status: 200 });
    },
  });
});

test('browser voice bridge contains no permanent OpenAI key or business side effects', () => {
  const client = readFileSync(new URL('../lib/flip-ai/realtime-client.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(client, /process\.env|OPENAI_API_KEY/);
  assert.doesNotMatch(client, /QualifiedLead|fireMeta|captureFlipAiLead|prisma/);
  assert.match(client, /\/api\/flip-ai\/public\/\$\{encodeURIComponent\(this\.options\.slug\)\}\/realtime\/session/);
  assert.match(client, /https:\/\/api\.openai\.com\/v1\/realtime\/calls/);
});

test('public chat alone receives microphone permission and stale clients cannot clear a newer client', () => {
  const nextConfig = readFileSync(new URL('../next.config.js', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../components/flip-ai/public-chat-shell.tsx', import.meta.url), 'utf8');
  assert.match(nextConfig, /source: '\/chat\/:path\*'/);
  assert.match(nextConfig, /microphone=\(self\)/);
  assert.match(nextConfig, /camera=\(\), microphone=\(\), geolocation=\(\)/);
  assert.match(shell, /voiceRef\.current === client/);
});
