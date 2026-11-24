import assert from 'node:assert/strict';
import test from 'node:test';
import { parseKeyIdentityScope, identityResponse } from '../lib/api-v1/credential-identity';

test('only exact read-key scope and one query parameter are allowed', () => {
  for (const scope of ['pipelines.read', 'forms.read', 'pipelines.metrics.read', 'leads.metadata.read']) {
    assert.equal(parseKeyIdentityScope('https://app.flipform.com.br/api/v1/credential-identity?scope='+scope), scope);
  }
  for (const query of ['','?tenantId=external','?scope=integrations.read','?scope=events.write','?scope=forms.read&scope=pipelines.read','?scope=forms.read&tenantId=other','?scope=webhooks.manage']) {
    assert.equal(parseKeyIdentityScope('https://example.invalid/api/v1/credential-identity'+query),null,query);
  }
});

test('identity response contains no token, user or business data fields', () => {
  const payload = identityResponse('tenant-from-bearer','integration-from-bearer','forms.read');
  assert.deepEqual(payload,{version:'v1',tenantId:'tenant-from-bearer',integrationId:'integration-from-bearer',scope:'forms.read',businessData:false});
  assert.equal(Object.keys(payload).length,5);
});

import { authorizeApiV1Request, digestApiV1Secret, type ApiV1CredentialRepository } from '../lib/api-v1/identity';

test('read-key identity demands exactly one scope, rejecting mixed read/write credentials', async () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const secret = Buffer.alloc(32, 3);
  const bearer = 'Bearer ffv1.' + id + '.' + secret.toString('base64url');
  const scopes = ['forms.read', 'events.write'];
  const repository: ApiV1CredentialRepository = {
    async findCredential() {
      return {
        id, tenantId: 'tenant-a', integrationId: 'integration-a', secretHashHex: digestApiV1Secret(secret),
        scopes, revokedAt: null, expiresAt: new Date('2027-12-31T00:00:00Z'),
      };
    },
    async findTenantEntitlement() {
      return {
        tenantId: 'tenant-a', tenantStatus: 'active', subscriptionStatus: 'active',
        planSlug: 'premium', planActive: true, featureEnabled: true, exceptionalGrantActive: false,
      };
    },
    async consumeQuota() { return true; },
  };
  const args = {
    authorizationHeader: bearer, scope: 'forms.read' as const,
    operation: 'GET /api/v1/credential-identity', requireExclusiveScope: true,
  };
  const denied = await authorizeApiV1Request(args, repository);
  assert.deepEqual(denied, { ok: false, status: 403, code: 'permission_denied' });
  scopes.splice(0, scopes.length, 'forms.read');
  const allowed = await authorizeApiV1Request(args, repository);
  assert.deepEqual(allowed, { ok: true, tenantId: 'tenant-a', integrationId: 'integration-a', scope: 'forms.read' });
  // Ordinary endpoints remain backward-compatible: they still accept multi-scoped credentials.
  scopes.push('events.write');
  assert.equal((await authorizeApiV1Request({ ...args, requireExclusiveScope: false }, repository)).ok, true);
});
