import test from 'node:test';
import assert from 'node:assert/strict';
import { PR00_STAGING } from '../lib/security/pr00-staging-db-identity';
import {
  pr00StagingIntegrationPreflightApproved,
  pr00StagingIntegrationPreflightChecks,
} from '../lib/security/pr00-staging-integration-preflight';

const env = {
  VERCEL: '1',
  VERCEL_ENV: 'preview',
  VERCEL_PROJECT_ID: PR00_STAGING.vercelProjectId,
  VERCEL_GIT_COMMIT_REF: PR00_STAGING.previewBranch,
  DATABASE_URL: 'placeholder-readonly-in-unit-tests',
  DIRECT_URL: 'placeholder-readonly-in-unit-tests',
};
const config = {
  git: { deploymentEnabled: { [PR00_STAGING.previewBranch]: false } },
};

test('isolated Preview without third-party credentials or cron schedules is acceptable', () => {
  assert.equal(pr00StagingIntegrationPreflightApproved(env, config), true);
  assert.deepEqual(
    Object.values(pr00StagingIntegrationPreflightChecks(env, config)).every(Boolean),
    true,
  );
});

test('no partial or wrong Vercel project, branch or environment can pass', () => {
  for (const [key, wrong] of [
    ['VERCEL_ENV', undefined],
    ['VERCEL_ENV', 'production'],
    ['VERCEL_PROJECT_ID', 'prj_other'],
    ['VERCEL_PROJECT_ID', undefined],
    ['VERCEL_GIT_COMMIT_REF', 'main'],
    ['VERCEL_GIT_COMMIT_REF', undefined],
  ] as const) {
    assert.equal(pr00StagingIntegrationPreflightApproved({ ...env, [key]: wrong }, config), false, key);
  }
});

test('never allow configured cron schedules or automatic deploy in diagnostic branch', () => {
  assert.equal(pr00StagingIntegrationPreflightApproved(env, { ...config, crons: [] }), true);
  assert.equal(pr00StagingIntegrationPreflightApproved(env, { ...config, crons: [{ path: '/api/cron/google-conversions', schedule: '* * * * *' }] }), false);
  assert.equal(pr00StagingIntegrationPreflightApproved(env, { ...config, git: { deploymentEnabled: { [PR00_STAGING.previewBranch]: true } } }), false);
  assert.equal(pr00StagingIntegrationPreflightApproved(env, null), false);
  assert.equal(pr00StagingIntegrationPreflightApproved(env, {}), false);
});

test('reject external provider and background job secret configuration', () => {
  for (const key of [
    'OPENAI_API_KEY', 'GOOGLE_CLIENT_SECRET', 'META_ACCESS_TOKEN',
    'WHATSAPP_ACCESS_TOKEN', 'STRIPE_SECRET_KEY', 'ZAPSIGN_API_TOKEN',
    'NEXT_PUBLIC_FACEBOOK_APP_ID', 'UPSTASH_REDIS_REST_TOKEN',
    'MONGODB_URI', 'RESEND_API_KEY', 'CRON_SECRET', 'INTERNAL_JOB_SECRET',
  ]) {
    assert.equal(
      pr00StagingIntegrationPreflightApproved({ ...env, [key]: 'synthetic-test-only' }, config),
      false, key,
    );
  }
});
