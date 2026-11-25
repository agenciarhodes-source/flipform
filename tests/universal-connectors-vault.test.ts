import assert from 'node:assert/strict';
import test from 'node:test';
import { universalConnectAllowed } from '../lib/universal-connectors/policy';
import { sealCredential, openCredential, currentVaultKey } from '../lib/universal-connectors/vault';

const tenant = '12345678-1234-1234-1234-123456789abc';
const binding = { tenantId: tenant, connectionId: 'conn-a', providerId: 'sample_erp' };
const key = { id: 'test-v1', bytes: Buffer.alloc(32, 7) };

test('default OFF, exact pilot allowlist, malformed and duplicate entries deny', () => {
  assert.equal(universalConnectAllowed(tenant, {}), false);
  const env = { UNIVERSAL_CONNECT_ENABLED: 'true', UNIVERSAL_CONNECT_PILOT_TENANT_IDS: tenant };
  assert.equal(universalConnectAllowed(tenant, env), true);
  assert.equal(universalConnectAllowed(tenant, { ...env, UNIVERSAL_CONNECT_PILOT_TENANT_IDS: '*' }), false);
  assert.equal(universalConnectAllowed(tenant, { ...env, UNIVERSAL_CONNECT_PILOT_TENANT_IDS: tenant + ',' + tenant }), false);
  assert.equal(universalConnectAllowed('other', env), false);
});
test('vault is randomized, preserves exact secret and binds tenant, connection, provider and key', () => {
  const secret = ' synthetic token ';
  const a = sealCredential(secret, binding, key);
  const b = sealCredential(secret, binding, key);
  assert.notEqual(a.ciphertext, b.ciphertext);
  assert.equal(openCredential(a, binding, key), secret);
  assert.throws(() => openCredential(a, { ...binding, tenantId: 'other' }, key));
  assert.throws(() => openCredential(a, { ...binding, connectionId: 'other' }, key));
  assert.throws(() => openCredential(a, { ...binding, providerId: 'other' }, key));
  assert.throws(() => openCredential(a, binding, { ...key, id: 'other' }));
  assert.throws(() => openCredential(a, binding, { ...key, bytes: Buffer.alloc(32, 8) }));
  assert.throws(() => openCredential({ ...a, ciphertext: a.ciphertext + ':x' }, binding, key));
  assert.throws(() => currentVaultKey({}));
  assert.deepEqual(currentVaultKey({ UNIVERSAL_CONNECT_VAULT_KEY: key.bytes.toString('base64url'), UNIVERSAL_CONNECT_VAULT_KEY_ID: key.id }), key);
});
