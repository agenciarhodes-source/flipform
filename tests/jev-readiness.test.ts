import assert from 'node:assert/strict';
import test from 'node:test';
import { __testOnly, runJevSyntheticReadinessProbe } from '../lib/flip-ai/jev-decision-engine';

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

test('synthetic readiness sends only constant fictitious state and returns safe diagnostics', async () => {
  let requestBody = '';
  const result = await runJevSyntheticReadinessProbe({
    apiKey: 'secret-test-key',
    fetchImpl: (async (_url, options) => {
      requestBody = String(options?.body);
      return jsonResponse({
        model: 'jev-1.13.0',
        answers: {
          route: {
            type: 'choice', choice: 'billing', confidence: 0.91,
            probabilities: { billing: 0.91, technical: 0.07, other: 0.02 },
          },
        },
        usage: { input_tokens: 42, output_tokens: 8 },
      });
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
    fetchImpl: (async () => jsonResponse({
      model: 'jev',
      answers: { route: { type: 'choice', choice: 'unexpected', confidence: 0.9 } },
      usage: { input_tokens: 1, output_tokens: 1 },
    })) as typeof fetch,
  }), /JEV_READINESS_DECISION_INVALID/);
});

test('synthetic readiness rejects implausible provider token counters', async () => {
  await assert.rejects(runJevSyntheticReadinessProbe({
    apiKey: 'test',
    fetchImpl: (async () => jsonResponse({
      model: 'jev',
      answers: { route: { type: 'choice', choice: 'billing', confidence: 0.9 } },
      usage: {
        input_tokens: __testOnly.limits.tokenCountPerCall + 1,
        output_tokens: 1,
      },
    })) as typeof fetch,
  }), /JEV_READINESS_RESPONSE_INVALID/);
});

test('synthetic readiness rejects answer values outside the allowlisted schema', async () => {
  await assert.rejects(runJevSyntheticReadinessProbe({
    apiKey: 'test',
    fetchImpl: (async () => jsonResponse({
      model: 'jev',
      answers: { route: { type: 'choice', choice: 'x'.repeat(65), confidence: 0.9 } },
      usage: { input_tokens: 1, output_tokens: 1 },
    })) as typeof fetch,
  }), /JEV_READINESS_RESPONSE_INVALID/);
});

test('live JEV rejects answer keys that were not requested', async () => {
  await assert.rejects(__testOnly.callJev({ latestMessage: 'Synthetic state' }, {
    apiKey: 'test',
    fetchImpl: (async (_url, options) => {
      const request = JSON.parse(String(options?.body));
      const choices: Record<string, string> = {
        intent: 'information', objection: 'none', journey_stage: 'discovery', next_action: 'answer_directly',
      };
      const answers = Object.fromEntries(Object.entries(request.questions).map(([key, question]) => {
        const type = (question as { type: string }).type;
        if (type === 'choice') return [key, { type, choice: choices[key], confidence: 0.9 }];
        if (type === 'score') return [key, { type, score: 2, confidence: 0.9 }];
        return [key, { type, noul: 0.1 }];
      }));
      answers.unrequested = { type: 'choice', choice: 'other', confidence: 0.9 };
      return jsonResponse({
        model: 'jev', answers, usage: { input_tokens: 1, output_tokens: 1 },
      });
    }) as typeof fetch,
  }), /JEV_RESPONSE_INVALID/);
});

test('JEV rejects oversized requests before calling the provider', async () => {
  let called = false;
  const oversizedState = Object.fromEntries(
    Array.from({length: 100}, (_, index) => [`field_${index}`, 'x'.repeat(4_000)]),
  );
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

test('JEV rejects non-JSON provider content before parsing it', async () => {
  await assert.rejects(runJevSyntheticReadinessProbe({
    apiKey: 'test',
    fetchImpl: (async () => new Response('<html>proxy error</html>', {
      headers: { 'Content-Type': 'text/html' },
    })) as typeof fetch,
  }), /JEV_RESPONSE_CONTENT_TYPE_INVALID/);
  await assert.rejects(runJevSyntheticReadinessProbe({
    apiKey: 'test',
    fetchImpl: (async () => new Response('{}')) as typeof fetch,
  }), /JEV_RESPONSE_CONTENT_TYPE_INVALID/);
});

test('JEV accepts registered application JSON media type variants', async () => {
  const result = await runJevSyntheticReadinessProbe({
    apiKey: 'test',
    fetchImpl: (async () => new Response(JSON.stringify({
      model: 'jev',
      answers: { route: { type: 'choice', choice: 'other', confidence: 0.8 } },
      usage: { input_tokens: 1, output_tokens: 1 },
    }), { headers: { 'Content-Type': 'application/vnd.typesafe+json' } })) as typeof fetch,
  });
  assert.equal(result.decision, 'other');
});

test('JEV stops oversized provider responses before parsing them', async () => {
  await assert.rejects(runJevSyntheticReadinessProbe({
    apiKey: 'test',
    fetchImpl: (async () => jsonResponse({
      padding: 'x'.repeat(__testOnly.limits.responseBytes + 1),
    })) as typeof fetch,
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
      return jsonResponse({
        model: 'jev',
        answers: {route: {type: 'choice', choice: 'technical', confidence: 0.9}},
        usage: {input_tokens: 1, output_tokens: 1},
      });
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
