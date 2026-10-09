import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FLIP_AI_MAX_OUTPUT_TOKENS,
  FLIP_AI_RECOVERY_MAX_OUTPUT_TOKENS,
  OpenAiResponseError,
  streamOpenAiText,
} from '../lib/flip-ai/openai-responses';

const input = { instructions: 'Teste', messages: [{ role: 'user' as const, content: 'Oi' }] };

function sse(events: unknown[]) {
  const body = events.map((event) => 'data: ' + JSON.stringify(event)).join('\n\n') + '\n\n';
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

test('orçamento de saída comporta o turno estruturado e pode ser ampliado', async () => {
  assert.equal(FLIP_AI_MAX_OUTPUT_TOKENS, 1_500);
  assert.equal(FLIP_AI_RECOVERY_MAX_OUTPUT_TOKENS > FLIP_AI_MAX_OUTPUT_TOKENS, true);
  const budgets: number[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    budgets.push(JSON.parse(String(init?.body)).max_output_tokens);
    return sse([
      { type: 'response.output_text.delta', delta: 'ok' },
      { type: 'response.completed', response: { id: 'resp_1', model: 'test-model', usage: { input_tokens: 1, output_tokens: 1 } } },
    ]);
  }) as typeof fetch;
  await streamOpenAiText(input, () => undefined, { apiKey: 'key', fetchImpl });
  await streamOpenAiText(input, () => undefined, { apiKey: 'key', fetchImpl, maxOutputTokens: FLIP_AI_RECOVERY_MAX_OUTPUT_TOKENS });
  assert.deepEqual(budgets, [FLIP_AI_MAX_OUTPUT_TOKENS, FLIP_AI_RECOVERY_MAX_OUTPUT_TOKENS]);
});

test('resposta interrompida pelo provedor é identificada como truncada, não como incerta', async () => {
  const fetchImpl = (async () => sse([
    { type: 'response.output_text.delta', delta: '{"reply":"Olá, como' },
    { type: 'response.incomplete', response: { id: 'resp_2', incomplete_details: { reason: 'max_output_tokens' } } },
  ])) as typeof fetch;
  await assert.rejects(
    streamOpenAiText(input, () => undefined, { apiKey: 'key', fetchImpl }),
    (error: unknown) => error instanceof OpenAiResponseError
      && error.kind === 'definitive'
      && error.code === 'OPENAI_RESPONSE_TRUNCATED',
  );
});

test('stream que termina sem sinal de conclusão continua sendo incerto', async () => {
  const fetchImpl = (async () => sse([{ type: 'response.output_text.delta', delta: 'parcial' }])) as typeof fetch;
  await assert.rejects(
    streamOpenAiText(input, () => undefined, { apiKey: 'key', fetchImpl }),
    (error: unknown) => error instanceof OpenAiResponseError
      && error.kind === 'ambiguous'
      && error.code === 'OPENAI_RESPONSE_INCOMPLETE',
  );
});
