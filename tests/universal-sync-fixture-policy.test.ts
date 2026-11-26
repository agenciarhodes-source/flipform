import assert from 'node:assert/strict';
import test from 'node:test';
import { localFixtureAllowed, normalizeFixtureRecord, fixturePage, decideRevision, requestDigest, retryState } from '../lib/universal-connectors/sync-fixture-policy';

const local = { NODE_ENV: 'test', UNIVERSAL_SYNC_FIXTURE_ENABLED: 'true', DATABASE_URL: 'postgresql://postgres:synthetic@127.0.0.1:5432/flipform_ci?schema=public' };
test('fixture refuses remote databases, Vercel, production and absent flag', () => {
  assert.equal(localFixtureAllowed(local), true);
  assert.equal(localFixtureAllowed({}), false);
  assert.equal(localFixtureAllowed({ ...local, VERCEL_ENV: 'preview' }), false);
  assert.equal(localFixtureAllowed({ ...local, NODE_ENV: 'production' }), false);
  assert.equal(localFixtureAllowed({ ...local, DATABASE_URL: local.DATABASE_URL.replace('127.0.0.1','example.invalid') }), false);
  assert.equal(localFixtureAllowed({ ...local, DATABASE_URL: local.DATABASE_URL + '&host=example.invalid' }), false);
});
test('bounded pages, strict typed data and no extra raw fields', () => {
  assert.equal(fixturePage(0).done, false);
  assert.equal(fixturePage(1).done, true);
  assert.throws(() => fixturePage(2));
  const sample = { id: 'fixture-a', updatedAt: '2026-01-01T00:00:00.000Z', amountMinor: 10000, currency: 'BRL', status: 'open' };
  assert.equal(normalizeFixtureRecord(sample).amountMinor, 10000);
  assert.throws(() => normalizeFixtureRecord({ ...sample, cpf: 'synthetic' }));
  assert.throws(() => normalizeFixtureRecord({ ...sample, amountMinor: 0.1 }));
  assert.throws(() => normalizeFixtureRecord({ ...sample, updatedAt: '2026-02-30T00:00:00.000Z' }));
  assert.throws(() => normalizeFixtureRecord({ ...sample, currency: 'USD' }));
});
test('idempotency, no stale overwrite, conflict and bounded retry', () => {
  const first = fixturePage(0).records[0], newer = fixturePage(1).records[0];
  assert.equal(decideRevision(null, first), 'insert');
  assert.equal(decideRevision(first, first), 'skip');
  assert.equal(decideRevision(first, newer), 'update');
  assert.equal(decideRevision(newer, first), 'skip');
  assert.equal(decideRevision(first, { ...first, amountMinor: 1 }), 'conflict');
  assert.equal(requestDigest('request-01'), requestDigest('request-01'));
  assert.notEqual(requestDigest('request-01'), requestDigest('request-02'));
  assert.throws(() => requestDigest('a'));
  assert.equal(retryState(2), 'queued');
  assert.equal(retryState(3), 'failed');
});
