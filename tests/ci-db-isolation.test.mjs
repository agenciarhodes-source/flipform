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
