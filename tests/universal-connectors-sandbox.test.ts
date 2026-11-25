import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { sandboxAvailable, sandboxOriginAllowed, publicIPv4, validCredential } from '../lib/universal-connectors/sandbox-policy';
import { sandboxProvider } from '../lib/universal-connectors/catalog';
import { makeOAuthPkce, bearerAuthorization } from '../lib/universal-connectors/auth-primitives';

const tenant = '12345678-1234-1234-1234-123456789abc';
const env = { VERCEL_ENV: 'preview', UNIVERSAL_CONNECT_SANDBOX_ENABLED: 'true', UNIVERSAL_CONNECT_ENABLED: 'true', UNIVERSAL_CONNECT_PILOT_TENANT_IDS: tenant };
test('sandbox gated, production and blocked preview denied', () => {
  assert.equal(sandboxAvailable(tenant, {}), false);
  assert.equal(sandboxAvailable(tenant, env), true);
  assert.equal(sandboxAvailable(tenant, { ...env, VERCEL_ENV: 'production' }), false);
  assert.equal(sandboxAvailable(tenant, { ...env, PR629_BLOCK_EXTERNAL_EGRESS: 'true' }), false);
  assert.equal(sandboxAvailable('other', env), false);
});
test('only exact preview origins, no arbitrary provider or local IP', () => {
  const e = { ...env, VERCEL_URL: 'demo.vercel.app' };
  assert.equal(sandboxOriginAllowed('https://demo.vercel.app', e), true);
  assert.equal(sandboxOriginAllowed('https://demo.vercel.app.evil.test', e), false);
  assert.equal(sandboxOriginAllowed(null, e), false);
  for (const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','192.0.2.1','198.18.0.1','198.51.100.1','203.0.113.1','::1','::ffff:127.0.0.1','224.0.0.1']) assert.equal(publicIPv4(ip), false, ip);
  assert.equal(publicIPv4('8.8.8.8'), true);
  assert.equal(sandboxProvider('https://localhost'), null);
  assert.equal(sandboxProvider('asaas_sandbox')?.allowedHosts[0], 'api-sandbox.asaas.com');
  assert.equal(validCredential('synthetic-key-12345\n'), false);
  assert.equal(validCredential('synthetic-key-12345'), true);
});
test('PKCE S256 and bearer reject header injection (no network)', () => {
  const p = makeOAuthPkce();
  assert.equal(p.challenge, createHash('sha256').update(p.verifier).digest('base64url'));
  assert.notEqual(p.state, makeOAuthPkce().state);
  assert.equal(bearerAuthorization('test.token'), 'Bearer test.token');
  assert.throws(() => bearerAuthorization('test\r\nX: bad'));
});
