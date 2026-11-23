import assert from 'node:assert/strict';
import test from 'node:test';
import { computeApiV1WebhookSignature, verifyApiV1WebhookSignature,
  type SignedDiagnosticWebhook } from '../lib/api-v1/webhook-security';
import { assessWebhookEgress, planWebhookRetry } from '../lib/api-v1/webhook-delivery-policy';

const scope = {
  tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  integrationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};
const now = new Date('2028-11-19T15:00:00.000Z');
const secret = Buffer.alloc(32, 39);

function signed(): SignedDiagnosticWebhook {
  const unsigned: SignedDiagnosticWebhook = {
    scope, rawBody: Buffer.from('{"kind":"diagnostic.ping"}'),
    unixSeconds: String(Math.floor(now.getTime() / 1000)),
    nonce: 'synthetic_nonce_value_0101', signature: '',
  };
  const signature = computeApiV1WebhookSignature(unsigned, secret);
  assert.ok(signature);
  return { ...unsigned, signature };
}

test('signed webhook verifies raw bytes, scope, timestamp, nonce and HMAC; no legacy bypass', () => {
  const request = signed();
  assert.equal(verifyApiV1WebhookSignature(request, secret, now), true);
  assert.equal(verifyApiV1WebhookSignature({
    ...request, rawBody: Buffer.from('{"kind":"diagnostic.ping"}\n'),
  }, secret, now), false);
  assert.equal(verifyApiV1WebhookSignature({
    ...request, scope: { ...scope, tenantId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
  }, secret, now), false);
  assert.equal(verifyApiV1WebhookSignature({ ...request, nonce: 'synthetic_nonce_value_0102' }, secret, now), false);
  assert.equal(verifyApiV1WebhookSignature(request, Buffer.alloc(32, 40), now), false);
  assert.equal(verifyApiV1WebhookSignature({ ...request, signature: 'v1=' + 'a'.repeat(64) }, secret, now), false);
  assert.equal(verifyApiV1WebhookSignature({ ...request, signature: 'v0=' + 'a'.repeat(64) }, secret, now), false);
  assert.equal(verifyApiV1WebhookSignature({
    ...request, unixSeconds: String(Math.floor(now.getTime() / 1000) - 301),
  }, secret, now), false);
  assert.equal(verifyApiV1WebhookSignature({
    ...request, unixSeconds: String(Math.floor(now.getTime() / 1000) + 301),
  }, secret, now), false);
  assert.equal(verifyApiV1WebhookSignature({
    ...request, rawBody: Buffer.alloc(65_537),
  }, secret, now), false);
  assert.equal(verifyApiV1WebhookSignature({
    ...request, nonce: 'short',
  }, secret, now), false);
});

test('destination assessment denies SSRF/private DNS, redirects, credentials and unknown hosts', () => {
  const base = {
    url: 'https://hooks.example.com/v1/ping',
    allowedHosts: ['hooks.example.com'],
    resolvedAddresses: ['93.184.216.34'],
  };
  assert.deepEqual(assessWebhookEgress(base), { eligible: true, hostname: 'hooks.example.com' });
  for (const url of [
    'http://hooks.example.com/v1/ping',
    'https://localhost/v1/ping',
    'https://127.0.0.1/v1/ping',
    'https://169.254.169.254/v1/ping',
    'https://[::1]/v1/ping',
    'https://user:pass@hooks.example.com/v1/ping',
    'https://hooks.example.com:8443/v1/ping',
    'https://hooks.example.com/v1/ping#anchor',
    'https://hooks.example.com.evil.example/v1/ping',
  ]) {
    assert.equal(assessWebhookEgress({ ...base, url }).eligible, false, url);
  }
  for (const resolvedAddresses of [
    ['127.0.0.1'], ['10.0.0.1'], ['172.20.2.1'], ['192.168.1.1'],
    ['169.254.169.254'], ['100.64.0.1'], ['198.18.0.1'],
    ['93.184.216.34', '10.0.0.1'], ['::1'], [],
  ]) {
    assert.deepEqual(assessWebhookEgress({ ...base, resolvedAddresses }),
      { eligible: false, reason: 'unapproved_address' });
  }
  assert.deepEqual(assessWebhookEgress({ ...base, allowedHosts: ['another.example.com'] }),
    { eligible: false, reason: 'unapproved_host' });
});

test('retry policy has bounded exponential backoff and never treats redirects as delivery', () => {
  assert.deepEqual(planWebhookRetry(1, 503), { action: 'retry', afterMs: 30_000 });
  assert.deepEqual(planWebhookRetry(2, 429), { action: 'retry', afterMs: 60_000 });
  assert.deepEqual(planWebhookRetry(3, null), { action: 'retry', afterMs: 120_000 });
  assert.deepEqual(planWebhookRetry(4, 408), { action: 'retry', afterMs: 240_000 });
  for (const status of [200, 301, 302, 307, 308, 400, 401, 403, 404]) {
    assert.deepEqual(planWebhookRetry(1, status), { action: 'dead_letter' });
  }
  assert.deepEqual(planWebhookRetry(5, 503), { action: 'dead_letter' });
  assert.deepEqual(planWebhookRetry(0, 503), { action: 'dead_letter' });
});
