import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { apiV1Enabled, apiV1Entitled, canManageApiV1Keys, isApiV1Scope, type ApiV1Entitlement } from '../lib/api-v1/policy';
import {
  authorizeApiV1Request, digestApiV1Secret, parseApiV1Bearer, verifyApiV1Secret,
  type ApiV1CredentialRecord, type ApiV1CredentialRepository,
} from '../lib/api-v1/identity';
import { apiV1Error } from '../lib/api-v1/errors';
import { idempotencyScope, requestFingerprint, validIdempotencyKey } from '../lib/api-v1/idempotency';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secret = Buffer.alloc(32, 7);
const other = Buffer.alloc(32, 8);
const token = 'Bearer ffv1.' + ID + '.' + secret.toString('base64url');

const grantA: ApiV1Entitlement = {
  tenantId: TENANT_A, tenantStatus: 'active', subscriptionStatus: 'active',
  planSlug: 'premium', planActive: true, featureEnabled: true, exceptionalGrantActive: false,
};
const activeCredential: ApiV1CredentialRecord = {
  id: ID, tenantId: TENANT_A, integrationId: 'integration-a',
  secretHashHex: digestApiV1Secret(secret),
  scopes: ['integrations.read', 'events.read'],
  revokedAt: null, expiresAt: new Date('2027-12-31T00:00:00Z'),
};
const NOW = new Date('2026-11-19T10:00:00Z');

function repository(params: {
  credential?: ApiV1CredentialRecord | null;
  entitlement?: ApiV1Entitlement | null;
  quota?: boolean;
  throws?: 'credential' | 'entitlement' | 'quota';
} = {}): ApiV1CredentialRepository {
  return {
    async findCredential(_id) {
      if (params.throws === 'credential') throw new Error('private secret data');
      return params.credential === undefined ? activeCredential : params.credential;
    },
    async findTenantEntitlement(_tenantId) {
      if (params.throws === 'entitlement') throw new Error('private DB connection string');
      return params.entitlement === undefined ? grantA : params.entitlement;
    },
    async consumeQuota(_args) {
      if (params.throws === 'quota') throw new Error('private redis endpoint');
      return params.quota ?? true;
    },
  };
}
const authorized = (repo: ApiV1CredentialRepository | null, authorizationHeader = token) =>
  authorizeApiV1Request({ authorizationHeader, scope: 'integrations.read', operation: 'GET /api/v1/status', now: NOW }, repo);

test('API v1 is disabled for absent, malformed and unintended feature flags', () => {
  for (const flag of [undefined, '', 'TRUE', '1', 'false']) {
    assert.equal(apiV1Enabled({ FLIPFORM_API_V1_ENABLED: flag }), false);
  }
  assert.equal(apiV1Enabled({ FLIPFORM_API_V1_ENABLED: 'true' }), true);
});

test('only approved scopes exist; API credential management does not inherit manager/admin permissions', () => {
  assert.equal(isApiV1Scope('integrations.read'), true);
  assert.equal(isApiV1Scope('pipeline.write'), false); // PR02, not PR01
  assert.equal(isApiV1Scope('*'), false);
  assert.equal(canManageApiV1Keys('owner', TENANT_A, TENANT_A), true);
  for (const role of ['admin', 'manager', 'agent', 'viewer', 'platform_admin']) {
    assert.equal(canManageApiV1Keys(role, TENANT_A, TENANT_A), false, role);
  }
  assert.equal(canManageApiV1Keys('owner', TENANT_A, TENANT_B), false);
});

test('entitlement requires same tenant, enabled feature, usable subscription and active plan', () => {
  assert.equal(apiV1Entitled(TENANT_A, grantA), true);
  assert.equal(apiV1Entitled(TENANT_B, grantA), false);
  assert.equal(apiV1Entitled(TENANT_A, { ...grantA, planSlug: 'inbox' }), false);
  assert.equal(apiV1Entitled(TENANT_A, { ...grantA, planSlug: 'pro' }), false);
  assert.equal(apiV1Entitled(TENANT_A, { ...grantA, planSlug: 'premium-pro', planActive: false }), false);
  assert.equal(apiV1Entitled(TENANT_A, { ...grantA, subscriptionStatus: 'canceled' }), false);
  assert.equal(apiV1Entitled(TENANT_A, { ...grantA, tenantStatus: 'blocked' }), false);
  assert.equal(apiV1Entitled(TENANT_A, { ...grantA, featureEnabled: false }), false);
  // Explicit audited per-tenant exception is allowed, but a blocked tenant never gets access.
  assert.equal(apiV1Entitled(TENANT_A, { ...grantA, planSlug: 'pro', planActive: false, exceptionalGrantActive: true }), true);
  assert.equal(apiV1Entitled(TENANT_A, { ...grantA, tenantStatus: 'blocked', exceptionalGrantActive: true }), false);
});

test('bearer header demands exact 32-byte secret and valid lookup ID', () => {
  const parsed = parseApiV1Bearer(token);
  assert.equal(parsed?.id, ID);
  assert.equal(parsed?.secret.equals(secret), true);
  assert.equal(parseApiV1Bearer(null), null);
  assert.equal(parseApiV1Bearer('Bearer not-a-key'), null);
  assert.equal(parseApiV1Bearer(token + '\n'), null);
  assert.equal(parseApiV1Bearer(token.replace('Bearer ', 'Basic ')), null);
  assert.equal(parseApiV1Bearer('Bearer ffv1.' + ID + '.' + secret.toString('base64url').slice(0, 42)), null);
  assert.equal(verifyApiV1Secret(secret, digestApiV1Secret(secret)), true);
  assert.equal(verifyApiV1Secret(other, digestApiV1Secret(secret)), false);
  assert.equal(verifyApiV1Secret(secret, 'bad'), false);
});

test('valid synthetic credential resolves only its own tenant and integration', async () => {
  assert.deepEqual(await authorized(repository()), {
    ok: true, tenantId: TENANT_A, integrationId: 'integration-a', scope: 'integrations.read',
  });
  assert.deepEqual(await authorized(repository({ entitlement: { ...grantA, tenantId: TENANT_B } })), {
    ok: false, status: 403, code: 'permission_denied',
  });
  assert.deepEqual(await authorized(repository({ credential: { ...activeCredential, scopes: ['events.read'] } })), {
    ok: false, status: 403, code: 'permission_denied',
  });
  assert.deepEqual(await authorized(repository({ credential: { ...activeCredential, scopes: ['*'] } })), {
    ok: false, status: 403, code: 'permission_denied',
  });
});

test('revoked, expired and incorrect credentials are rejected and not silently reassigned', async () => {
  const wrong = 'Bearer ffv1.' + ID + '.' + other.toString('base64url');
  for (const scenario of [
    repository({ credential: null }),
    repository({ credential: { ...activeCredential, revokedAt: NOW } }),
    repository({ credential: { ...activeCredential, expiresAt: NOW } }),
    repository({ credential: { ...activeCredential, tenantId: '' } }),
    repository({ credential: { ...activeCredential, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } }),
  ]) {
    assert.deepEqual(await authorized(scenario), { ok: false, status: 401, code: 'invalid_credential' });
  }
  assert.deepEqual(await authorized(repository(), wrong), { ok: false, status: 401, code: 'invalid_credential' });
});

test('a missing repository and any critical dependency outage must deny, never allow', async () => {
  assert.deepEqual(await authorized(null), { ok: false, status: 503, code: 'dependency_unavailable' });
  for (const where of ['credential', 'entitlement', 'quota'] as const) {
    assert.deepEqual(await authorized(repository({ throws: where })), {
      ok: false, status: 503, code: 'dependency_unavailable',
    });
  }
  assert.deepEqual(await authorized(repository({ quota: false })), {
    ok: false, status: 429, code: 'rate_limited',
  });
});

test('idempotency functions isolate tenant/integration/operation and reject malformed keys', () => {
  assert.equal(validIdempotencyKey('event-unique-key-001'), true);
  assert.equal(validIdempotencyKey('no'), false);
  assert.equal(validIdempotencyKey({}), false);
  const identity = { tenantId: TENANT_A, integrationId: 'integration-a', operation: 'event.create', key: 'event-unique-key-001' };
  assert.equal(typeof idempotencyScope(identity), 'string');
  assert.notEqual(idempotencyScope(identity), idempotencyScope({ ...identity, tenantId: TENANT_B }));
  assert.notEqual(idempotencyScope(identity), idempotencyScope({ ...identity, integrationId: 'integration-b' }));
  assert.equal(idempotencyScope({ ...identity, key: 'bad' }), null);
  assert.equal(requestFingerprint('event.create', '{"a":1}'), requestFingerprint('event.create', '{"a":1}'));
  assert.notEqual(requestFingerprint('event.create', '{"a":1}'), requestFingerprint('event.create', '{"a":2}'));
});

test('v1 error envelopes are consistent, generic and non-cacheable', async () => {
  const error = apiV1Error('api_unavailable', 404);
  assert.equal(error.status, 404);
  assert.equal(error.headers.get('Cache-Control'), 'no-store');
  const payload = await error.json();
  assert.equal(payload.code, 'api_unavailable');
  assert.equal(typeof payload.requestId, 'string');
  assert.equal('token' in payload, false);
  assert.equal('tenantId' in payload, false);
});
