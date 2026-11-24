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
