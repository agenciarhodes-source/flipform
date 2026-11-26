import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertCIIsolatedDatabase, assertLocalDatabaseUrl } from '../scripts/assert-ci-local-db.mjs';

const local = 'postgresql://postgres:local-test-only@127.0.0.1:5432/flipform_e2e?schema=public';

test('accepts only the named disposable localhost database', () => {
  assert.equal(assertLocalDatabaseUrl(local, 'flipform_e2e'), true);
  assert.equal(assertLocalDatabaseUrl(local.replace('127.0.0.1', 'localhost'), 'flipform_e2e'), true);
});

test('rejects remote URLs, wrong databases, roles and ports', () => {
  for (const candidate of [
    'postgresql://postgres:redacted@ep-example.neon.tech:5432/flipform_e2e',
    'postgresql://postgres:redacted@127.0.0.1:5432/production',
    'postgresql://admin:redacted@127.0.0.1:5432/flipform_e2e',
    'postgresql://postgres:redacted@127.0.0.1:6432/flipform_e2e',
    'https://localhost/flipform_e2e',
    local + '&host=remote.example.com',
    local + '&schema=public',
    local.replace('schema=public', 'schema=private'),
    local + '#fragment',
    '',
  ]) {
    assert.throws(() => assertLocalDatabaseUrl(candidate, 'flipform_e2e'));
  }
});

test('requires both database URLs for Playwright and never logs their values', () => {
  assert.equal(assertCIIsolatedDatabase({ DATABASE_URL: local, DIRECT_URL: local }, 'flipform_e2e', true), true);
  assert.throws(() => assertCIIsolatedDatabase({ DATABASE_URL: local }, 'flipform_e2e', true), /DIRECT_URL/);
  const token = 'private-password-must-not-appear';
  assert.throws(
    () => assertLocalDatabaseUrl(`postgresql://postgres:${token}@remote.example.com:5432/flipform_e2e`, 'flipform_e2e'),
    (error) => !error.message.includes(token) && /remote database forbidden/.test(error.message),
  );
});

test('Playwright workflow does not reference external database secrets', () => {
  const workflow = readFileSync(new URL('../.github/workflows/playwright.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /secrets\.(?:DATABASE_URL|DIRECT_URL)/);
  assert.match(workflow, /assert-ci-local-db\.mjs flipform_e2e --require-direct/);
  assert.match(workflow, /127\.0\.0\.1:5432\/flipform_e2e/);
});

test('main CI database is hardcoded to a disposable local runner', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /secrets\.(?:DATABASE_URL|DIRECT_URL)/);
  assert.match(workflow, /assert-ci-local-db\.mjs flipform_ci/);
});

test('Vercel config cannot declare platform crons and disables deploys for the audit branch', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.git.deploymentEnabled['audit/pr00-a2s-isolation'], false);
  assert.equal(Object.hasOwn(config, 'crons'), false);
});

test('expensive checks run only after review-ready, on pushes to main, or by explicit dispatch', () => {
  for (const workflowName of ['ci.yml', 'playwright.yml']) {
    const workflow = readFileSync(new URL('../.github/workflows/' + workflowName, import.meta.url), 'utf8');
    assert.match(workflow, /types:\s*\[opened, synchronize, reopened, ready_for_review\]/);
    assert.match(workflow, /if:\s*github\.event_name != 'pull_request' \|\| !github\.event\.pull_request\.draft/);
    assert.match(workflow, /workflow_dispatch:/);
  }
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(ci, /Developer MFA and tenant-grant authorization tests/);
  assert.match(ci, /Typecheck/);
  assert.match(ci, /Build/);
  const e2e = readFileSync(new URL('../.github/workflows/playwright.yml', import.meta.url), 'utf8');
  assert.match(e2e, /cancel-in-progress: true/);
  assert.match(e2e, /Run Playwright onboarding tests/);
});
