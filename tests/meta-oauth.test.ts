import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET_CURRENT = 'meta-oauth-test-secret';

test('OAuth state binds nonce, tenant, user and expiration', async () => {
  const { createMetaOAuthState, verifyMetaOAuthState } = await import('../lib/meta/oauth-state');
  const created = createMetaOAuthState('tenant-a', 'user-a', 1_000);
  assert.equal(verifyMetaOAuthState(created.cookie, created.state, 'tenant-a', 'user-a', 2_000), true);
  assert.equal(verifyMetaOAuthState(created.cookie, 'wrong', 'tenant-a', 'user-a', 2_000), false);
  assert.equal(verifyMetaOAuthState(created.cookie, created.state, 'tenant-b', 'user-a', 2_000), false);
  assert.equal(verifyMetaOAuthState(created.cookie, created.state, 'tenant-a', 'user-b', 2_000), false);
  assert.equal(verifyMetaOAuthState(created.cookie, created.state, 'tenant-a', 'user-a', 1_000 + 601_000), false);
  assert.equal(verifyMetaOAuthState(undefined, created.state, 'tenant-a', 'user-a'), false);
});

test('authorization URL uses only fixed server-side scopes and host', async () => {
  const { buildMetaAuthorizationUrl, META_PLATFORM_REQUIRED_SCOPES } = await import('../lib/meta/oauth');
  const url = new URL(buildMetaAuthorizationUrl('app-1', 'https://app.example/api/integrations/meta/callback', 'nonce'));
  assert.equal(url.hostname, 'www.facebook.com');
  assert.equal(url.pathname, '/v26.0/dialog/oauth');
  assert.deepEqual(url.searchParams.get('scope')?.split(','), [...META_PLATFORM_REQUIRED_SCOPES]);
  assert.equal(url.searchParams.has('pages_messaging'), false);
});

test('token exchange rejects a successful response without a token', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ expires_in: 30 }), { status: 200 }));
  const { exchangeMetaAuthorizationCode } = await import('../lib/meta/oauth');
  await assert.rejects(exchangeMetaAuthorizationCode({ appId: 'id', appSecret: 'secret', redirectUri: 'https://app.example/callback', code: 'code' }), /missing token/);
});

test('token validation reports scopes actually granted', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/me/permissions')) return new Response(JSON.stringify({ data: [{ permission: 'ads_read', status: 'granted' }] }));
    return new Response(JSON.stringify({ id: 'meta-user', name: 'Meta User' }));
  });
  const { validateMetaAuthorization } = await import('../lib/meta/oauth');
  const result = await validateMetaAuthorization('plaintext-test-token', 'secret');
  assert.deepEqual(result.grantedScopes, ['ads_read']);
  assert.deepEqual(result.missingScopes.sort(), ['ads_management', 'business_management']);
});
