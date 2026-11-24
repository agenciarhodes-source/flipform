import assert from 'node:assert/strict';
import test from 'node:test';
import {
  apiV1QuotaWindowEnd, diagnosticOutboxFinalizedAt, nextApiIntegrationDisabledAt,
} from '../lib/api-v1/lifecycle-clocks';

test('disable clock is recorded, and reactivation clears it', () => {
  const now = new Date('2026-11-23T15:00:00.000Z');
  assert.deepEqual(nextApiIntegrationDisabledAt('disabled', now), now);
  assert.equal(nextApiIntegrationDisabledAt('active', now), null);
  assert.throws(() => nextApiIntegrationDisabledAt('disabled', new Date(NaN)));
});
test('quota window end is persisted at the initial policy boundary', () => {
  const start = new Date('2026-11-23T15:00:00.000Z');
  assert.deepEqual(apiV1QuotaWindowEnd(start, 60000),
    new Date('2026-11-23T15:01:00.000Z'));
  assert.throws(() => apiV1QuotaWindowEnd(start, 0));
  assert.throws(() => apiV1QuotaWindowEnd(start, Number.MAX_SAFE_INTEGER));
});
test('retry and dead letter never become completed events', () => {
  const now = new Date('2026-11-23T15:00:00.000Z');
  assert.equal(diagnosticOutboxFinalizedAt('retry', now), null);
  assert.equal(diagnosticOutboxFinalizedAt('dead_letter', now), null);
  assert.deepEqual(diagnosticOutboxFinalizedAt('simulated_success', now), now);
});
