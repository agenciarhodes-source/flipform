import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';

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

test('authorization URL uses the server-side Business Login configuration', async () => {
  const { buildMetaAuthorizationUrl, META_PLATFORM_REQUIRED_SCOPES } = await import('../lib/meta/oauth');
  const url = new URL(buildMetaAuthorizationUrl({ appId: 'app-1', redirectUri: 'https://app.example/api/integrations/meta/callback', state: 'nonce', businessLoginConfigId: 'platform-config' }));
  assert.equal(url.hostname, 'www.facebook.com');
  assert.equal(url.pathname, '/v26.0/dialog/oauth');
  assert.equal(url.searchParams.get('config_id'), 'platform-config');
  assert.equal(url.searchParams.get('client_id'), 'app-1');
  assert.equal(url.searchParams.get('state'), 'nonce');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://app.example/api/integrations/meta/callback');
  assert.equal(url.searchParams.has('scope'), false);
  assert.deepEqual([...META_PLATFORM_REQUIRED_SCOPES], ['ads_read', 'ads_management', 'business_management']);
  assert.equal(url.searchParams.has('pages_messaging'), false);
});

test('token exchange rejects a successful response without a token', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ expires_in: 30 }), { status: 200 }));
  const { exchangeMetaAuthorizationCode } = await import('../lib/meta/oauth');
  await assert.rejects(exchangeMetaAuthorizationCode({ appId: 'id', appSecret: 'secret', redirectUri: 'https://app.example/callback', code: 'code' }), /missing token/);
});

const completeInspection = (overrides: Record<string, unknown> = {}) => ({
  data: {
    is_valid: true,
    app_id: 'app-id',
    type: 'SYSTEM_USER',
    user_id: 'system-user-id',
    scopes: ['ads_read', 'ads_management', 'business_management'],
    ...overrides,
  },
});

async function inspectWith(t: TestContext, payload: unknown) {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(payload)));
  const { validateMetaAuthorization } = await import('../lib/meta/oauth');
  return validateMetaAuthorization({ accessToken: 'plaintext-test-token', appId: 'app-id', appSecret: 'app-secret' });
}

test('validates a system-user token with the platform App Access Token', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/v26.0/debug_token');
    assert.equal(url.searchParams.get('input_token'), 'plaintext-test-token');
    assert.equal(url.searchParams.get('access_token'), 'app-id|app-secret');
    return new Response(JSON.stringify(completeInspection()));
  });
  const { validateMetaAuthorization, META_BUSINESS_LOGIN_TOKEN_TYPES } = await import('../lib/meta/oauth');
  const result = await validateMetaAuthorization({ accessToken: 'plaintext-test-token', appId: 'app-id', appSecret: 'app-secret' });
  assert.equal(result.metaUserId, 'system-user-id');
  assert.equal(result.metaUserName, null);
  assert.equal(result.tokenType, 'SYSTEM_USER');
  assert.deepEqual(result.missingScopes, []);
  assert.deepEqual([...META_BUSINESS_LOGIN_TOKEN_TYPES], ['USER', 'SYSTEM_USER']);
});

test('reports a missing ads_management scope as a permissions failure', async (t) => {
  const result = await inspectWith(t, completeInspection({ scopes: ['ads_read', 'business_management'] }));
  assert.deepEqual(result.missingScopes, ['ads_management']);
});

test('rejects a valid token issued to another app', async (t) => {
  await assert.rejects(inspectWith(t, completeInspection({ app_id: 'other-app' })), /app mismatch/);
});

test('rejects an invalid token', async (t) => {
  await assert.rejects(inspectWith(t, completeInspection({ is_valid: false })), /invalid token/);
});

test('rejects an inspection without a principal id', async (t) => {
  await assert.rejects(inspectWith(t, completeInspection({ user_id: undefined })), /missing principal/);
});

test('accepts compatible USER tokens', async (t) => {
  const user = await inspectWith(t, completeInspection({ type: 'USER' }));
  assert.equal(user.tokenType, 'USER');
});

test('rejects unknown token types', async (t) => {
  await assert.rejects(inspectWith(t, completeInspection({ type: 'PAGE' })), /unsupported token type/);
});

test('keeps permanent tokens without an invented expiration', async (t) => {
  const result = await inspectWith(t, completeInspection());
  assert.equal(result.tokenExpiresAt, null);
});

test('uses the inspected Unix expiration for expiring tokens', async (t) => {
  const result = await inspectWith(t, completeInspection({ expires_at: 1_800_000_000 }));
  assert.equal(result.tokenExpiresAt?.toISOString(), '2027-01-15T08:00:00.000Z');
});

test('turns a Meta timeout into a safe error', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new DOMException('token leaked', 'TimeoutError'); });
  const { validateMetaAuthorization } = await import('../lib/meta/oauth');
  await assert.rejects(
    validateMetaAuthorization({ accessToken: 'secret-token', appId: 'app-id', appSecret: 'app-secret' }),
    (error: Error) => error.message === 'Meta token_inspection unavailable' && !error.message.includes('secret'),
  );
});

test('sanitizes Meta HTTP errors and log payloads', async (t) => {
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    error: { message: 'secret-token app-secret', code: 190, type: 'OAuthException' },
  }), { status: 500 }));
  const { validateMetaAuthorization } = await import('../lib/meta/oauth');
  await assert.rejects(
    validateMetaAuthorization({ accessToken: 'secret-token', appId: 'app-id', appSecret: 'app-secret' }),
    (error: Error) => error.message === 'Meta token_inspection failed',
  );
  const serializedLogs = JSON.stringify(logged);
  assert.equal(serializedLogs.includes('secret-token'), false);
  assert.equal(serializedLogs.includes('app-secret'), false);
  assert.match(serializedLogs, /190/);
  assert.match(serializedLogs, /OAuthException/);
});

test('turns a Meta 4xx response into the same safe error', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    error: { message: 'sensitive upstream detail', code: 190, type: 'OAuthException' },
  }), { status: 400 }));
  const { validateMetaAuthorization } = await import('../lib/meta/oauth');
  await assert.rejects(
    validateMetaAuthorization({ accessToken: 'secret-token', appId: 'app-id', appSecret: 'app-secret' }),
    (error: Error) => error.message === 'Meta token_inspection failed' && !error.message.includes('sensitive'),
  );
});
