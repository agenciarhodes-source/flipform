import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET_CURRENT = 'meta-connection-health-test-secret';

const now = new Date('2026-08-17T16:00:00.000Z');

function instagramConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ig-connection',
    status: 'connected',
    connectedAt: new Date('2026-08-16T16:00:00.000Z'),
    tokenExpiresAt: new Date('2026-09-17T16:00:00.000Z'),
    lastValidatedAt: new Date('2026-08-17T15:00:00.000Z'),
    ...overrides,
  } as any;
}

function whatsappConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wa-connection',
    status: 'connected',
    phoneNumberId: '123456',
    connectedAt: new Date('2026-08-16T16:00:00.000Z'),
    systemUserAssignedAt: new Date('2026-08-16T16:00:00.000Z'),
    subscribedAt: new Date('2026-08-16T16:00:00.000Z'),
    lastValidatedAt: new Date('2026-08-17T15:00:00.000Z'),
    ...overrides,
  } as any;
}

test('Instagram health requires reconnect only for authorization failures, not temporary provider errors', async () => {
  const { buildInstagramConnectionHealth } = await import('../lib/meta/instagram-connection-health');

  const temporary = buildInstagramConnectionHealth({
    connection: instagramConnection(),
    platformAvailable: true,
    webhookSubscriptionComplete: true,
    latestHealthAudit: {
      state: 'provider_error',
      reason: 'provider_temporarily_unavailable',
      createdAt: new Date('2026-08-17T15:30:00.000Z'),
    },
    now,
  });
  assert.equal(temporary.state, 'provider_error');
  assert.equal(temporary.reconnectRecommended, false);
  assert.equal(temporary.retryable, true);

  const authorization = buildInstagramConnectionHealth({
    connection: instagramConnection(),
    platformAvailable: true,
    webhookSubscriptionComplete: true,
    latestHealthAudit: {
      state: 'action_required',
      reason: 'authorization_or_permission_invalid',
      createdAt: new Date('2026-08-17T15:30:00.000Z'),
    },
    now,
  });
  assert.equal(authorization.state, 'action_required');
  assert.equal(authorization.reconnectRecommended, true);
});

test('Instagram health fails closed on expired token and missing webhook proof', async () => {
  const { buildInstagramConnectionHealth } = await import('../lib/meta/instagram-connection-health');

  const expired = buildInstagramConnectionHealth({
    connection: instagramConnection({ tokenExpiresAt: new Date('2026-08-17T15:59:59.000Z') }),
    platformAvailable: true,
    webhookSubscriptionComplete: true,
    latestHealthAudit: null,
    now,
  });
  assert.equal(expired.state, 'expired');
  assert.equal(expired.reconnectRecommended, true);

  const webhookMissing = buildInstagramConnectionHealth({
    connection: instagramConnection(),
    platformAvailable: true,
    webhookSubscriptionComplete: false,
    latestHealthAudit: null,
    now,
  });
  assert.equal(webhookMissing.state, 'action_required');
});

test('WhatsApp health distinguishes registration work from reconnection work', async () => {
  const { buildWhatsAppConnectionHealth } = await import('../lib/meta/whatsapp-connection-health');

  const pendingRegistration = buildWhatsAppConnectionHealth({
    connection: whatsappConnection(),
    platformAvailable: true,
    runtimeAvailable: true,
    registeredAt: null,
    latestHealthAudit: null,
    now,
  });
  assert.equal(pendingRegistration.state, 'action_required');
  assert.equal(pendingRegistration.reconnectRecommended, false);
  assert.match(pendingRegistration.summary, /PIN de 6 dígitos/i);
});

test('healthy channel connections stay healthy when local prerequisites and validation are fresh', async () => {
  const { buildInstagramConnectionHealth } = await import('../lib/meta/instagram-connection-health');
  const { buildWhatsAppConnectionHealth } = await import('../lib/meta/whatsapp-connection-health');

  const instagram = buildInstagramConnectionHealth({
    connection: instagramConnection(),
    platformAvailable: true,
    webhookSubscriptionComplete: true,
    latestHealthAudit: null,
    now,
  });
  const whatsapp = buildWhatsAppConnectionHealth({
    connection: whatsappConnection(),
    platformAvailable: true,
    runtimeAvailable: true,
    registeredAt: new Date('2026-08-16T17:00:00.000Z'),
    latestHealthAudit: null,
    now,
  });
  assert.equal(instagram.state, 'healthy');
  assert.equal(whatsapp.state, 'healthy');
});

test('provider failure classifier is conservative around transient Meta failures', async () => {
  const { classifyMetaConnectionProviderError } = await import('../lib/meta/connection-health-types');

  const throttled = new Error('Meta request failed') as Error & { status?: number };
  throttled.status = 429;
  assert.equal(classifyMetaConnectionProviderError(throttled).state, 'provider_error');

  const denied = new Error('Meta request failed') as Error & { status?: number };
  denied.status = 401;
  assert.equal(classifyMetaConnectionProviderError(denied).state, 'action_required');
});
