import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET_CURRENT = 'meta-user-token-test-secret';

test('exchanges a Meta USER token for a long-lived token server-side', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://graph.facebook.com');
    assert.equal(url.pathname, '/v26.0/oauth/access_token');
    assert.equal(url.searchParams.get('grant_type'), 'fb_exchange_token');
    assert.equal(url.searchParams.get('client_id'), 'app-id');
    assert.equal(url.searchParams.get('client_secret'), 'app-secret');
    assert.equal(url.searchParams.get('fb_exchange_token'), 'short-user-token');
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    return new Response(JSON.stringify({ access_token: 'long-user-token', token_type: 'bearer', expires_in: 5_184_000 }), { status: 200 });
  });

  const { exchangeMetaUserAccessTokenForLongLived } = await import('../lib/meta/oauth');
  const result = await exchangeMetaUserAccessTokenForLongLived({
    appId: 'app-id',
    appSecret: 'app-secret',
    accessToken: 'short-user-token',
  });

  assert.deepEqual(result, { accessToken: 'long-user-token', expiresIn: 5_184_000 });
});

test('rejects a long-lived exchange response without a token', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ expires_in: 5_184_000 }), { status: 200 }));
  const { exchangeMetaUserAccessTokenForLongLived } = await import('../lib/meta/oauth');
  await assert.rejects(
    exchangeMetaUserAccessTokenForLongLived({ appId: 'app-id', appSecret: 'app-secret', accessToken: 'short-user-token' }),
    /missing token/,
  );
});

test('sanitizes Meta errors from the long-lived token exchange', async (t) => {
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    error: { message: 'short-user-token app-secret', code: 190, type: 'OAuthException' },
  }), { status: 400 }));

  const { exchangeMetaUserAccessTokenForLongLived } = await import('../lib/meta/oauth');
  await assert.rejects(
    exchangeMetaUserAccessTokenForLongLived({ appId: 'app-id', appSecret: 'app-secret', accessToken: 'short-user-token' }),
    (error: Error) => error.message === 'Meta long_lived_user_token_exchange failed',
  );

  const serialized = JSON.stringify(logged);
  assert.equal(serialized.includes('short-user-token'), false);
  assert.equal(serialized.includes('app-secret'), false);
  assert.match(serialized, /190/);
  assert.match(serialized, /OAuthException/);
});
