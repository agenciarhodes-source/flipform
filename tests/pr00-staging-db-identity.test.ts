import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PR00_STAGING,
  stagingIdentityGateEnabled,
  matchesStagingIdentityToken,
  matchesLiveDatabaseIdentity,
} from '../lib/security/pr00-staging-db-identity';

const password = 'synthetic-nonproduction-password';
const url = 'postgresql://' + PR00_STAGING.roleName + ':' + password + '@' +
  PR00_STAGING.neonHost + '/' + PR00_STAGING.databaseName + '?sslmode=require';
const token = 'A'.repeat(48);
const env = {
  PR00_STAGING_ATTESTATION_ENABLED: 'true',
  PR00_STAGING_ATTESTATION_TOKEN: token,
  VERCEL_ENV: 'production',
  VERCEL_PROJECT_ID: PR00_STAGING.vercelProjectId,
  NODE_ENV: 'production',
  DATABASE_URL: url,
  DIRECT_URL: url,
};

test('PR00 identity disabled unless all staging conditions are met', () => {
  assert.equal(stagingIdentityGateEnabled(env), true);
  for (const key of Object.keys(env)) {
    assert.equal(stagingIdentityGateEnabled({ ...env, [key]: undefined }), false, 'missing ' + key + ' must block');
  }
  assert.equal(stagingIdentityGateEnabled({ ...env, PR00_STAGING_ATTESTATION_ENABLED: 'false' }), false);
  assert.equal(stagingIdentityGateEnabled({ ...env, VERCEL_ENV: 'preview' }), false);
  assert.equal(stagingIdentityGateEnabled({ ...env, NODE_ENV: 'test' }), false);
  assert.equal(stagingIdentityGateEnabled({ ...env, VERCEL_PROJECT_ID: 'prj_7CWjG34Zspu7iUrhXweIKR0uNG0v' }), false);
  assert.equal(stagingIdentityGateEnabled({ ...env, PR00_STAGING_ATTESTATION_TOKEN: 'weak' }), false);
});

test('wrong host / database / role / TLS / password blocks before any SQL', () => {
  const alternatives = [
    url.replace(PR00_STAGING.neonHost, 'ep-flat-voice-ap2ciwlx.c-7.us-east-1.aws.neon.tech'),
    url.replace(PR00_STAGING.databaseName, 'neondb'),
    url.replace(PR00_STAGING.roleName, 'neondb_owner'),
    url.replace('sslmode=require', 'sslmode=disable'),
    url.replace('sslmode=require', ''),
    url.replace(':' + password + '@', '@'),
    url.replace('postgresql://', 'https://'),
    'not-a-url',
  ];
  for (const other of alternatives) {
    assert.equal(stagingIdentityGateEnabled({ ...env, DATABASE_URL: other }), false);
    assert.equal(stagingIdentityGateEnabled({ ...env, DIRECT_URL: other }), false);
  }
});

test('token is required, compared exactly and must be at least 32 UTF8 bytes', () => {
  assert.equal(matchesStagingIdentityToken(token, token), true);
  assert.equal(matchesStagingIdentityToken(token.slice(0, -1), token), false);
  assert.equal(matchesStagingIdentityToken(token + 'x', token), false);
  assert.equal(matchesStagingIdentityToken('', token), false);
  assert.equal(matchesStagingIdentityToken('short', 'short'), false);
  assert.equal(matchesStagingIdentityToken(null, token), false);
  assert.equal(matchesStagingIdentityToken(token, undefined), false);
});

test('read-only DB identity must match staging database name and role exactly', () => {
  assert.equal(matchesLiveDatabaseIdentity({
    database_name: PR00_STAGING.databaseName,
    role_name: PR00_STAGING.roleName,
  }), true);
  assert.equal(matchesLiveDatabaseIdentity({ database_name: 'neondb', role_name: PR00_STAGING.roleName }), false);
  assert.equal(matchesLiveDatabaseIdentity({ database_name: PR00_STAGING.databaseName, role_name: 'neondb_owner' }), false);
  assert.equal(matchesLiveDatabaseIdentity(undefined), false);
});
