import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pr00StagingRoutePolicy,
  PR00_STAGING_PREVIEW_PROJECT_ID,
  PR00_STAGING_IDENTITY_PATH,
} from '../lib/security/pr00-staging-route-lockdown';

const preview = {
  VERCEL: '1',
  VERCEL_ENV: 'preview',
  VERCEL_PROJECT_ID: PR00_STAGING_PREVIEW_PROJECT_ID,
  VERCEL_GIT_COMMIT_REF: 'security/pr00-a2d-staging-db-attestation-20261118',
};
const decide = (
  env: Record<string, string | undefined>,
  method = 'GET',
  pathname = PR00_STAGING_IDENTITY_PATH,
) => pr00StagingRoutePolicy(env, { method, pathname });

test('only the exact GET identity path reaches the guarded endpoint in isolated Preview', () => {
  assert.equal(decide(preview), 'allow');
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    assert.equal(decide(preview, method), 'deny', method);
  }
  for (const pathname of [
    '/', '/login', '/admin', '/dashboard', '/leads',
    '/api/v1/capabilities', '/api/cron', '/api/webhooks',
    '/api/whatsapp', '/api/integrations',
    PR00_STAGING_IDENTITY_PATH + '/',
    PR00_STAGING_IDENTITY_PATH + '/anything',
    '/_next/data', '/api/internal/pr00/another-route',
  ]) {
    assert.equal(decide(preview, 'GET', pathname), 'deny', pathname);
  }
});

test('any incomplete Vercel context fails closed instead of falling through to CRM', () => {
  const variants = [
    { ...preview, VERCEL_ENV: undefined },
    { ...preview, VERCEL_PROJECT_ID: undefined },
    { ...preview, VERCEL_ENV: 'production' },
    { ...preview, VERCEL_PROJECT_ID: 'prj_other_project' },
    { VERCEL: '1' },
    { VERCEL_ENV: 'preview' },
    { VERCEL_GIT_COMMIT_REF: preview.VERCEL_GIT_COMMIT_REF },
    { VERCEL_PROJECT_ID: PR00_STAGING_PREVIEW_PROJECT_ID },
  ];
  for (const [index, env] of variants.entries()) {
    assert.equal(decide(env), 'deny', 'case ' + index);
  }
});

test('no Vercel environment markers: ordinary local and CI app remain unchanged', () => {
  assert.equal(decide({}), 'local');
  assert.equal(decide({ NODE_ENV: 'test', CI: 'true' }, 'POST', '/api/lead'), 'local');
});
