import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listMetaAdAccountPixels,
  listMetaBusinessAdAccounts,
  listMetaBusinesses,
  validateMetaAssetSelection,
} from '../lib/meta/assets';

const originalFetch = global.fetch;

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

test.afterEach(() => {
  global.fetch = originalFetch;
});

test('lists authorized businesses without exposing the access token in the URL', async () => {
  const seen: { url: string; authorization?: string }[] = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, authorization: new Headers(init?.headers).get('authorization') || undefined });
    return response({ data: [{ id: '22', name: 'Zulu' }, { id: '11', name: 'Alpha' }, { id: 99, name: 'invalid' }] });
  }) as typeof fetch;

  const result = await listMetaBusinesses({ accessToken: 'secret-user-token', appSecret: 'app-secret' });
  assert.deepEqual(result, [{ id: '11', name: 'Alpha' }, { id: '22', name: 'Zulu' }]);
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /\/me\/businesses/);
  assert.equal(seen[0].url.includes('secret-user-token'), false);
  assert.equal(seen[0].authorization, 'Bearer secret-user-token');
});

test('combines owned and client ad accounts and normalizes Graph IDs', async () => {
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/owned_ad_accounts')) {
      return response({ data: [{ id: 'act_123', account_id: '123', name: 'Conta própria' }] });
    }
    if (url.includes('/client_ad_accounts')) {
      return response({ data: [{ id: '456', account_id: '456', name: 'Conta cliente' }, { id: 'act_123', account_id: '123', name: 'Duplicada' }] });
    }
    throw new Error(`unexpected URL ${url}`);
  }) as typeof fetch;

  const result = await listMetaBusinessAdAccounts({ accessToken: 'token', appSecret: 'secret', businessId: '999' });
  assert.deepEqual(result, [
    { id: 'act_456', accountId: '456', name: 'Conta cliente' },
    { id: 'act_123', accountId: '123', name: 'Duplicada' },
  ]);
});

test('lists pixels / datasets for an authorized ad account', async () => {
  global.fetch = (async (input: RequestInfo | URL) => {
    assert.match(String(input), /\/act_123\/adspixels/);
    return response({ data: [{ id: '777', name: 'Site principal' }, { id: null, name: 'invalid' }] });
  }) as typeof fetch;

  const result = await listMetaAdAccountPixels({ accessToken: 'token', appSecret: 'secret', adAccountId: '123' });
  assert.deepEqual(result, [{ id: '777', name: 'Site principal' }]);
});

test('validates the complete business -> ad account -> pixel chain before persisting', async () => {
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/me/businesses')) return response({ data: [{ id: '10', name: 'Empresa teste' }] });
    if (url.includes('/10/owned_ad_accounts')) return response({ data: [{ id: 'act_20', account_id: '20', name: 'Conta teste' }] });
    if (url.includes('/10/client_ad_accounts')) return response({ data: [] });
    if (url.includes('/act_20/adspixels')) return response({ data: [{ id: '30', name: 'Pixel teste' }] });
    throw new Error(`unexpected URL ${url}`);
  }) as typeof fetch;

  const selection = await validateMetaAssetSelection({
    accessToken: 'token',
    appSecret: 'secret',
    businessId: '10',
    adAccountId: '20',
    pixelId: '30',
  });
  assert.deepEqual(selection, {
    business: { id: '10', name: 'Empresa teste' },
    adAccount: { id: 'act_20', accountId: '20', name: 'Conta teste' },
    pixel: { id: '30', name: 'Pixel teste' },
  });
});

test('rejects a business that is not in the authorized business list', async () => {
  global.fetch = (async () => response({ data: [{ id: '10', name: 'Empresa teste' }] })) as typeof fetch;

  await assert.rejects(
    validateMetaAssetSelection({ accessToken: 'token', appSecret: 'secret', businessId: '99', adAccountId: '20', pixelId: '30' }),
    /Meta business is not authorized/,
  );
});
