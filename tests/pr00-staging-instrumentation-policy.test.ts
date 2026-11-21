import test from 'node:test';
import assert from 'node:assert/strict';
import { pr00InstrumentationDecision } from '../lib/security/pr00-staging-instrumentation-policy';

const expected = {
  VERCEL: '1',
  VERCEL_ENV: 'preview',
  VERCEL_PROJECT_ID: 'prj_UOvo8lKGiIvp7IuBS4vtL9CnSZIu',
  VERCEL_GIT_COMMIT_REF: 'security/pr00-a2d-staging-db-attestation-20261118',
  NODE_ENV: 'production',
  NEXT_RUNTIME: 'nodejs',
};

test('staging diagnostic skips all Sentry bootstrap in Node and Edge', () => {
  assert.equal(pr00InstrumentationDecision(expected), 'skip-telemetry');
  assert.equal(pr00InstrumentationDecision({ ...expected, NEXT_RUNTIME: 'edge' }), 'skip-telemetry');
  // Edge may not have the branch marker, unlike Node.
  assert.equal(pr00InstrumentationDecision({ ...expected, NEXT_RUNTIME: 'edge', VERCEL_GIT_COMMIT_REF: undefined }), 'skip-telemetry');
});

test('bad project/target/branch or incomplete Vercel context must not load Sentry', () => {
  const variants = [
    { ...expected, VERCEL_ENV: 'production' },
    { ...expected, VERCEL_ENV: undefined },
    { ...expected, VERCEL_PROJECT_ID: undefined },
    { ...expected, VERCEL_PROJECT_ID: 'prj_wrong' },
    { ...expected, VERCEL_GIT_COMMIT_REF: 'main' },
    { ...expected, VERCEL_GIT_COMMIT_REF: undefined },
    { ...expected, NODE_ENV: 'development' },
    { ...expected, NEXT_RUNTIME: 'edge', VERCEL_GIT_COMMIT_REF: 'main' },
    { VERCEL: '1' },
    { VERCEL_ENV: 'preview' },
    { VERCEL_PROJECT_ID: expected.VERCEL_PROJECT_ID },
  ];
  for (const [index, env] of variants.entries()) {
    assert.equal(pr00InstrumentationDecision(env), 'deny', String(index));
  }
});

test('offline tests and local development continue the original Sentry bootstrap', () => {
  assert.equal(pr00InstrumentationDecision({}), 'local');
  assert.equal(pr00InstrumentationDecision({ NODE_ENV: 'test', CI: 'true', NEXT_RUNTIME: 'nodejs' }), 'local');
});
