import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertProductionMaintenance } from '../scripts/assert-production-maintenance-db.mjs';

const example = {
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  MAINTENANCE_ACTION: 'production-schema',
  MAINTENANCE_CONFIRM: 'REPAIR production-schema',
  MAINTENANCE_ENVIRONMENT: 'production-maintenance',
  MAINTENANCE_GATE: 'enabled',
  MAINTENANCE_DB_HOST: 'ep-example-pooler.region.aws.neon.tech',
  MAINTENANCE_DIRECT_HOST: 'ep-example.region.aws.neon.tech',
  MAINTENANCE_DB_NAME: 'app_production',
  MAINTENANCE_DB_USER: 'app_owner',
  DATABASE_URL: 'postgresql://app_owner:redacted@ep-example-pooler.region.aws.neon.tech/app_production?sslmode=require',
  DIRECT_URL: 'postgresql://app_owner:redacted@ep-example.region.aws.neon.tech/app_production?sslmode=require',
};

test('accepts exact allowlisted destination and manual confirmation only', () => {
  assert.equal(assertProductionMaintenance(example), true);
});

test('rejects wrong manual event, ref, action, confirmation and missing environment gate', () => {
  for (const [key, value] of [
    ['GITHUB_EVENT_NAME', 'pull_request'],
    ['GITHUB_REF', 'refs/heads/security/pr00'],
    ['MAINTENANCE_ACTION', 'another-action'],
    ['MAINTENANCE_CONFIRM', 'YES'],
    ['MAINTENANCE_ENVIRONMENT', 'preview'],
    ['MAINTENANCE_GATE', ''],
  ]) {
    assert.throws(() => assertProductionMaintenance({ ...example, [key]: value }), /blocked/);
  }
});

test('rejects incorrect host, database, role, TLS and absent direct connection', () => {
  for (const [key, value] of [
    ['DATABASE_URL', example.DATABASE_URL.replace('ep-example-pooler', 'ep-attacker')],
    ['DATABASE_URL', example.DATABASE_URL.replace('/app_production', '/other')],
    ['DATABASE_URL', example.DATABASE_URL.replace('app_owner:', 'postgres:')],
    ['DATABASE_URL', example.DATABASE_URL.replace('sslmode=require', 'sslmode=disable')],
    ['DIRECT_URL', ''],
    ['MAINTENANCE_DIRECT_HOST', 'localhost'],
  ]) {
    assert.throws(() => assertProductionMaintenance({ ...example, [key]: value }), /blocked/);
  }
});

test('never exposes passwords in errors', () => {
  const secret = 'never-echo-this-password';
  assert.throws(
    () => assertProductionMaintenance({ ...example, DATABASE_URL: 'postgresql://app_owner:' + secret + '@malicious.invalid/app_production?sslmode=require' }),
    (error) => !error.message.includes(secret),
  );
});

test('all maintenance workflows require the same preflight before any DB command', () => {
  for (const file of [
    'repair-production-schema.yml',
    'repair-business-group-schema.yml',
    'repair-team-hierarchy-schema.yml',
    'repair-whatsapp-cloud-schema.yml',
  ]) {
    const yml = readFileSync(new URL('../.github/workflows/' + file, import.meta.url), 'utf8');
    assert.match(yml, /environment: production-maintenance/);
    assert.match(yml, /MAINTENANCE_GATE: \$\{\{ vars\.MAINTENANCE_GATE \}\}/);
    assert.match(yml, /run: node scripts\/assert-production-maintenance-db\.mjs/);
    assert.match(yml, /github\.ref == 'refs\/heads\/main'/);
    assert.ok(yml.indexOf('run: node scripts/assert-production-maintenance-db.mjs') < yml.indexOf('run: npm ci'));
    assert.doesNotMatch(yml, /pull_request:/);
  }
});
