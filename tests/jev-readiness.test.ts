import assert from 'node:assert/strict';
import test from 'node:test';
import { __testOnly, runJevSyntheticReadinessProbe } from '../lib/flip-ai/jev-decision-engine';

test('synthetic readiness sends only constant fictitious state and returns safe diagnostics', async () => {
  let requestBody = '';
  const result = await runJevSyntheticReadinessProbe({
    apiKey: 'secret-test-key',
    fetchImpl: (async (_url, options) => {
      requestBody = String(options?.body);
      return new Response(JSON.stringify({
        model: 'jev-1.13.0',
        answers: {
          route: {
            type: 'choice', choice: 'billing', confidence: 0.91,
            probabilities: { billing: 0.91, technical: 0.07, other: 0.02 },
          },
        },
        usage: { input_tokens: 42, output_tokens: 8 },
      }));
    }) as typeof fetch,
  });

  assert.equal(result.ok, true);
  assert.equal(result.decision, 'billing');
  assert.equal(result.inputTokens, 42);
  assert.ok(!requestBody.includes('secret-test-key'));
  assert.match(requestBody, /Synthetic test/);
  for (const forbidden of ['tenantId', 'conversationId', 'leadId', 'knowledgeIndexId', 'WhatsApp', 'CPF']) {
    assert.ok(!requestBody.includes(forbidden));
  }
});

test('synthetic readiness rejects a provider response outside the declared choices', async () => {
  await assert.rejects(runJevSyntheticReadinessProbe({
    apiKey: 'test',
    fetchImpl: (async () => new Response(JSON.stringify({
      model: 'jev',
      answers: { route: { type: 'choice', choice: 'unexpected', confidence: 0.9 } },
      usage: { input_tokens: 1, output_tokens: 1 },
    }))) as typeof fetch,
  }), /JEV_READINESS_DECISION_INVALID/);
});

test('JEV rejects oversized requests before calling the provider', async () => {
  let called = false;
  const oversizedState = Array.from({length: 40_000}, () => 'abcdefgh');
  await assert.rejects(__testOnly.callJev(oversizedState, {
    apiKey: 'test',
    fetchImpl: (async () => {
      called = true;
      return new Response('{}');
    }) as typeof fetch,
  }), /JEV_REQUEST_TOO_LARGE/);
  assert.ok(JSON.stringify(oversizedState).length > __testOnly.limits.requestBytes);
  assert.equal(called, false);
});

test('JEV stops oversized provider responses before parsing them', async () => {
  await assert.rejects(runJevSyntheticReadinessProbe({
    apiKey: 'test',
    fetchImpl: (async () => new Response(JSON.stringify({
      padding: 'x'.repeat(__testOnly.limits.responseBytes + 1),
    }))) as typeof fetch,
  }), /JEV_RESPONSE_TOO_LARGE/);
});

test('JEV pins the provider destination and refuses redirects, cache, cookies and referrer', async () => {
  let destination = '';
  let requestOptions: RequestInit | undefined;
  await runJevSyntheticReadinessProbe({
    apiKey: 'test',
    fetchImpl: (async (url, options) => {
      destination = String(url);
      requestOptions = options;
      return new Response(JSON.stringify({
        model: 'jev',
        answers: {route: {type: 'choice', choice: 'technical', confidence: 0.9}},
        usage: {input_tokens: 1, output_tokens: 1},
      }));
    }) as typeof fetch,
  });
  const headers = new Headers(requestOptions?.headers);
  assert.equal(destination, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(requestOptions?.redirect, 'error');
  assert.equal(requestOptions?.cache, 'no-store');
  assert.equal(requestOptions?.credentials, 'omit');
  assert.equal(requestOptions?.referrerPolicy, 'no-referrer');
  assert.equal(headers.get('accept'), 'application/json');
});
