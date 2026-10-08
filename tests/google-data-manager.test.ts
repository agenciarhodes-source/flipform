import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  GOOGLE_DATA_MANAGER_INGEST_URL,
  buildGoogleConversionIngestRequest,
  checkGoogleFunnelTransportReadiness,
  getGoogleDataManagerAccessToken,
  hashGoogleIdentifier,
  normalizeGoogleEmail,
  normalizeGooglePhoneE164,
  resetGoogleDataManagerTokenCache,
  resolveGoogleFunnelTransportConfig,
  sendGoogleConversionIngest,
} from '../lib/tracking/google-data-manager';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const serviceAccountJson = JSON.stringify({ client_email: 'flipform@example.iam.gserviceaccount.com', private_key: privateKey });

const readyEnv = {
  GOOGLE_FUNNEL_TRANSPORT_ENABLED: 'true',
  GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_JSON: serviceAccountJson,
  GOOGLE_DATA_MANAGER_LOGIN_ACCOUNT_ID: '552-412-4552',
  GOOGLE_FUNNEL_TENANT_ACCOUNTS: 'tenant-a:8620752033, tenant-b:1111111111,invalid,tenant-c:123',
};

const input = {
  tenantId: 'tenant-a',
  conversionActionResource: 'customers/8620752033/conversionActions/7828520611',
  idempotencyKey: 'gads:abc',
  conversionTime: new Date('2026-10-07T20:00:00.000Z'),
  clickIds: { gclid: 'Cj0KCQ_abc', gbraid: 'gb-1' },
  lead: { email: ' Maria.Silva+ads@Gmail.com ', phone: '(86) 99999-1234' },
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

test('transporte nasce desligado, em dry run e sem dados de usuário', () => {
  const config = resolveGoogleFunnelTransportConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.validateOnly, true);
  assert.equal(config.sendUserData, false);
  assert.equal(config.serviceAccount, null);
  assert.equal(config.loginAccountId, null);
  assert.deepEqual(checkGoogleFunnelTransportReadiness(config, 'tenant-a', '8620752033'), { ready: false, code: 'TRANSPORT_DISABLED' });
  assert.deepEqual(buildGoogleConversionIngestRequest(config, input), { ok: false, code: 'TRANSPORT_DISABLED' });
});

test('gates falham fechados sem credencial ou sem pareamento tenant-conta', () => {
  const noCredentials = resolveGoogleFunnelTransportConfig({ ...readyEnv, GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_JSON: '{"client_email":"x"}' });
  assert.deepEqual(checkGoogleFunnelTransportReadiness(noCredentials, 'tenant-a', '8620752033'), { ready: false, code: 'CREDENTIALS_MISSING' });

  const config = resolveGoogleFunnelTransportConfig(readyEnv);
  assert.deepEqual(checkGoogleFunnelTransportReadiness(config, 'tenant-a', '8620752033'), { ready: true });
  // A tenant can never reach another tenant's Google Ads account.
  assert.deepEqual(checkGoogleFunnelTransportReadiness(config, 'tenant-a', '1111111111'), { ready: false, code: 'TENANT_ACCOUNT_NOT_ALLOWED' });
  assert.deepEqual(checkGoogleFunnelTransportReadiness(config, 'tenant-b', '8620752033'), { ready: false, code: 'TENANT_ACCOUNT_NOT_ALLOWED' });
  assert.deepEqual(checkGoogleFunnelTransportReadiness(config, 'tenant-c', '123'), { ready: false, code: 'TENANT_ACCOUNT_NOT_ALLOWED' });
  assert.deepEqual(
    buildGoogleConversionIngestRequest(config, { ...input, tenantId: 'tenant-b' }),
    { ok: false, code: 'TENANT_ACCOUNT_NOT_ALLOWED' },
  );
  assert.deepEqual(
    buildGoogleConversionIngestRequest(config, { ...input, conversionActionResource: 'AW-123/label' }),
    { ok: false, code: 'INVALID_CONVERSION_ACTION' },
  );
});

test('credencial aceita JSON puro ou base64', () => {
  const base64 = Buffer.from(serviceAccountJson, 'utf8').toString('base64');
  const config = resolveGoogleFunnelTransportConfig({ ...readyEnv, GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_JSON: base64 });
  assert.equal(config.serviceAccount?.clientEmail, 'flipform@example.iam.gserviceaccount.com');
  assert.equal(resolveGoogleFunnelTransportConfig({ ...readyEnv, GOOGLE_DATA_MANAGER_SERVICE_ACCOUNT_JSON: 'não é json' }).serviceAccount, null);
});

test('normaliza e-mail e telefone conforme as regras do Google', () => {
  assert.equal(normalizeGoogleEmail(' Maria.Silva+ads@Gmail.com '), 'mariasilva@gmail.com');
  assert.equal(normalizeGoogleEmail('User.Name+NYC@Example.com'), 'user.name+nyc@example.com');
  assert.equal(normalizeGoogleEmail('a b@googlemail.com'), 'ab@googlemail.com');
  assert.equal(normalizeGoogleEmail('sem-arroba'), null);
  assert.equal(normalizeGoogleEmail(null), null);
  assert.equal(normalizeGooglePhoneE164('(86) 99999-1234'), '+5586999991234');
  assert.equal(normalizeGooglePhoneE164('86 3222-1234'), '+558632221234');
  assert.equal(normalizeGooglePhoneE164('5586999991234'), '+5586999991234');
  assert.equal(normalizeGooglePhoneE164('+1 (800) 555-0100'), '+18005550100');
  assert.equal(normalizeGooglePhoneE164('086 99999-1234'), '+5586999991234');
  assert.equal(normalizeGooglePhoneE164('12345'), null);
  assert.equal(normalizeGooglePhoneE164(''), null);
  assert.equal(hashGoogleIdentifier('mariasilva@gmail.com').length, 64);
  assert.equal(hashGoogleIdentifier('+5586999991234'), '56c79ae655dfc398c5561aa14c89859f8e79a1528b14076704d1c76a647eedb1');
});

test('monta a requisição só com click ID quando dados de usuário não estão liberados', () => {
  const config = resolveGoogleFunnelTransportConfig(readyEnv);
  const built = buildGoogleConversionIngestRequest(config, input);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.customerId, '8620752033');
  assert.deepEqual(built.body, {
    destinations: [
      {
        operatingAccount: { accountType: 'GOOGLE_ADS', accountId: '8620752033' },
        loginAccount: { accountType: 'GOOGLE_ADS', accountId: '5524124552' },
        productDestinationId: '7828520611',
      },
    ],
    events: [
      {
        transactionId: 'gads:abc',
        eventTimestamp: '2026-10-07T20:00:00.000Z',
        eventSource: 'WEB',
        adIdentifiers: { gclid: 'Cj0KCQ_abc' },
      },
    ],
    validateOnly: true,
  });
  const serialized = JSON.stringify(built.body);
  assert.equal(serialized.includes('maria'), false);
  assert.equal(serialized.includes('99999'), false);
});

test('inclui dados de usuário somente com hash e somente quando liberado', () => {
  const config = resolveGoogleFunnelTransportConfig({ ...readyEnv, GOOGLE_FUNNEL_SEND_USER_DATA: 'true', GOOGLE_FUNNEL_VALIDATE_ONLY: 'false' });
  const built = buildGoogleConversionIngestRequest(config, { ...input, clickIds: null, conversionValue: 5000, currency: 'BRL' });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const event = (built.body.events as Array<Record<string, unknown>>)[0];
  assert.deepEqual(event.userData, {
    userIdentifiers: [
      { emailAddress: hashGoogleIdentifier('mariasilva@gmail.com') },
      { phoneNumber: hashGoogleIdentifier('+5586999991234') },
    ],
  });
  assert.equal('adIdentifiers' in event, false);
  assert.equal(event.conversionValue, 5000);
  assert.equal(event.currency, 'BRL');
  assert.equal(built.body.encoding, 'HEX');
  assert.deepEqual(built.body.consent, { adUserData: 'CONSENT_GRANTED', adPersonalization: 'CONSENT_GRANTED' });
  assert.equal(built.body.validateOnly, false);
  const serialized = JSON.stringify(built.body);
  assert.equal(serialized.toLowerCase().includes('maria'), false);
  assert.equal(serialized.includes('5586999991234'), false);
});

test('sem click ID e sem dados liberados o evento não é enviável', () => {
  const config = resolveGoogleFunnelTransportConfig(readyEnv);
  assert.deepEqual(buildGoogleConversionIngestRequest(config, { ...input, clickIds: null }), { ok: false, code: 'NO_IDENTIFIER' });
  assert.deepEqual(buildGoogleConversionIngestRequest(config, { ...input, clickIds: { gclid: 'tem espaço' } }), { ok: false, code: 'NO_IDENTIFIER' });
  const withoutLogin = resolveGoogleFunnelTransportConfig({ ...readyEnv, GOOGLE_DATA_MANAGER_LOGIN_ACCOUNT_ID: '' });
  const built = buildGoogleConversionIngestRequest(withoutLogin, { ...input, clickIds: { wbraid: 'wb-1' } });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const destination = (built.body.destinations as Array<Record<string, any>>)[0];
  assert.equal(destination.loginAccount.accountId, '8620752033');
  assert.deepEqual((built.body.events as Array<Record<string, unknown>>)[0].adIdentifiers, { wbraid: 'wb-1' });
});

test('token de service account é obtido uma vez e reaproveitado', async () => {
  resetGoogleDataManagerTokenCache();
  const config = resolveGoogleFunnelTransportConfig(readyEnv);
  assert.ok(config.serviceAccount);
  let calls = 0;
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls += 1;
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    const params = new URLSearchParams(String(init?.body));
    assert.equal(params.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    assert.equal((params.get('assertion') || '').split('.').length, 3);
    return jsonResponse(200, { access_token: 'token-1', expires_in: 3600 });
  };
  assert.equal(await getGoogleDataManagerAccessToken(config.serviceAccount, { fetchImpl, nowMs: 1_000_000 }), 'token-1');
  assert.equal(await getGoogleDataManagerAccessToken(config.serviceAccount, { fetchImpl, nowMs: 1_000_000 + 60_000 }), 'token-1');
  assert.equal(calls, 1);
  assert.equal(await getGoogleDataManagerAccessToken(config.serviceAccount, { fetchImpl, nowMs: 1_000_000 + 3_590_000 }), 'token-1');
  assert.equal(calls, 2);

  resetGoogleDataManagerTokenCache();
  assert.equal(await getGoogleDataManagerAccessToken(config.serviceAccount, { fetchImpl: async () => jsonResponse(400, { error: 'invalid_grant' }) }), null);
  assert.equal(await getGoogleDataManagerAccessToken({ clientEmail: 'x@y', privateKey: 'não é chave' }, { fetchImpl }), null);
  resetGoogleDataManagerTokenCache();
});

test('envio classifica a resposta sem vazar mensagens do provedor', async () => {
  const body = { validateOnly: false, events: [] };
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  const sent = await sendGoogleConversionIngest(body, 'token-1', {
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return jsonResponse(200, { requestId: 'req-123' });
    },
  });
  assert.deepEqual(sent, { outcome: 'sent', requestId: 'req-123' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, GOOGLE_DATA_MANAGER_INGEST_URL);
  assert.equal(seen[0].init?.method, 'POST');
  assert.equal((seen[0].init?.headers as Record<string, string>).Authorization, 'Bearer token-1');

  assert.deepEqual(
    await sendGoogleConversionIngest({ validateOnly: true }, 't', { fetchImpl: async () => jsonResponse(200, { requestId: 'x' }) }),
    { outcome: 'validated' },
  );
  assert.deepEqual(
    await sendGoogleConversionIngest(body, 't', {
      fetchImpl: async () => jsonResponse(400, { error: { status: 'INVALID_ARGUMENT', message: 'lead maria@example.com inválido' } }),
    }),
    { outcome: 'rejected', code: 'INVALID_ARGUMENT' },
  );
  assert.deepEqual(
    await sendGoogleConversionIngest(body, 't', { fetchImpl: async () => jsonResponse(403, { error: { status: 'PERMISSION_DENIED' } }) }),
    { outcome: 'retry', code: 'PERMISSION_DENIED' },
  );
  assert.deepEqual(
    await sendGoogleConversionIngest(body, 't', { fetchImpl: async () => new Response('gateway', { status: 503 }) }),
    { outcome: 'retry', code: 'HTTP_503' },
  );
  assert.deepEqual(
    await sendGoogleConversionIngest(body, 't', { fetchImpl: async () => jsonResponse(429, { error: { status: 'RESOURCE_EXHAUSTED' } }) }),
    { outcome: 'retry', code: 'RESOURCE_EXHAUSTED' },
  );
  assert.deepEqual(
    await sendGoogleConversionIngest(body, 't', { fetchImpl: async () => { throw new Error('socket Bearer token-1'); } }),
    { outcome: 'retry', code: 'NETWORK_ERROR' },
  );
});

test('transporte não acessa banco nem registra dados em log', () => {
  const source = readFileSync('lib/tracking/google-data-manager.ts', 'utf8');
  for (const forbidden of ['prisma', 'console.', 'sendMetaCapiEvent', 'kanbanStageTrackingEvent', 'tenantIntegrationSettings']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
