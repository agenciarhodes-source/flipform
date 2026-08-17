import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET_CURRENT = 'meta-platform-readiness-test-secret';

function configuredSettings() {
  return {
    appId: '123456789',
    businessLoginConfigId: 'ads-config',
    instagramAppId: 'instagram-app',
    whatsappEmbeddedSignupConfigId: 'wa-config',
    whatsappBusinessId: 'business-1',
    whatsappSystemUserId: 'system-user-1',
    appSecretConfigured: true,
    appSecretMasked: '****',
    instagramAppSecretConfigured: true,
    instagramAppSecretMasked: '****',
    whatsappAdminSystemUserAccessTokenConfigured: true,
    whatsappAdminSystemUserAccessTokenMasked: '****',
    whatsappSystemUserAccessTokenConfigured: true,
    whatsappSystemUserAccessTokenMasked: '****',
    redirectUri: 'https://app.flipform.com.br/api/integrations/meta/callback',
    defaultPixelEnabled: true,
    defaultCapiEnabled: true,
    defaultAdvancedMatchingEnabled: true,
    defaultAttributionEnabled: true,
    defaultQualifiedLeadEnabled: true,
    defaultPurchaseEnabled: true,
    baseConfigured: true,
    businessLoginConfigured: true,
    instagramLoginConfigured: true,
    whatsappEmbeddedSignupConfigured: true,
    configured: true,
    updatedAt: null,
    updatedBy: null,
  };
}

const readableProbes = {
  metaOAuthReadable: true,
  instagramLoginReadable: true,
  instagramWebhookSecretReadable: true,
  whatsappEmbeddedSignupReadable: true,
  whatsappRuntimeReadable: true,
  whatsappWebhookSecretReadable: true,
};

test('Meta readiness reports internal readiness without claiming external Meta approval', async () => {
  const { buildMetaPlatformReadiness } = await import('../lib/meta/platform-readiness');
  const readiness = buildMetaPlatformReadiness(
    configuredSettings() as any,
    readableProbes,
    {
      nodeEnv: 'production',
      appUrl: 'https://app.flipform.com.br',
      instagramWebhookVerifyTokenConfigured: true,
      whatsappWebhookVerifyTokenConfigured: true,
    },
    new Date('2026-08-17T12:00:00.000Z'),
  );

  assert.equal(readiness.status, 'ready_for_external_validation');
  assert.equal(readiness.components.every(component => component.status === 'ready'), true);
  assert.equal(readiness.releaseGates.length, 3);
  assert.equal(readiness.releaseGates.every(gate => gate.status === 'manual'), true);
  assert.match(readiness.summary, /gates externos/i);
  assert.equal(readiness.endpoints.instagramWebhook, 'https://app.flipform.com.br/api/webhooks/meta/instagram');
  assert.equal(readiness.endpoints.whatsappWebhook, 'https://app.flipform.com.br/api/webhooks/meta/whatsapp');
});

test('Meta readiness fails closed when secrets are configured but cannot be read', async () => {
  const { buildMetaPlatformReadiness } = await import('../lib/meta/platform-readiness');
  const readiness = buildMetaPlatformReadiness(
    configuredSettings() as any,
    { ...readableProbes, metaOAuthReadable: false, whatsappRuntimeReadable: false },
    {
      nodeEnv: 'production',
      appUrl: 'https://app.flipform.com.br',
      instagramWebhookVerifyTokenConfigured: true,
      whatsappWebhookVerifyTokenConfigured: true,
    },
  );

  assert.equal(readiness.status, 'action_required');
  assert.equal(readiness.components.find(component => component.key === 'base')?.status, 'action_required');
  assert.equal(readiness.components.find(component => component.key === 'whatsapp')?.status, 'action_required');
});

test('Meta readiness requires webhook verify tokens without exposing their values', async () => {
  const { buildMetaPlatformReadiness } = await import('../lib/meta/platform-readiness');
  const readiness = buildMetaPlatformReadiness(
    configuredSettings() as any,
    readableProbes,
    {
      nodeEnv: 'production',
      appUrl: 'https://app.flipform.com.br',
      instagramWebhookVerifyTokenConfigured: false,
      whatsappWebhookVerifyTokenConfigured: false,
    },
  );

  assert.equal(readiness.status, 'action_required');
  const instagramCheck = readiness.components
    .find(component => component.key === 'instagram_webhook')
    ?.checks.find(check => check.key === 'instagram_webhook_verify_token');
  const whatsappCheck = readiness.components
    .find(component => component.key === 'whatsapp_webhook')
    ?.checks.find(check => check.key === 'whatsapp_webhook_verify_token');

  assert.equal(instagramCheck?.status, 'fail');
  assert.equal(whatsappCheck?.status, 'fail');
  assert.equal(JSON.stringify(readiness).includes('secret-token-value'), false);
});

test('Meta readiness rejects localhost as a production callback base', async () => {
  const { buildMetaPlatformReadiness } = await import('../lib/meta/platform-readiness');
  const settings = configuredSettings();
  settings.redirectUri = 'http://localhost:3000/api/integrations/meta/callback';

  const readiness = buildMetaPlatformReadiness(
    settings as any,
    readableProbes,
    {
      nodeEnv: 'production',
      appUrl: 'http://localhost:3000',
      instagramWebhookVerifyTokenConfigured: true,
      whatsappWebhookVerifyTokenConfigured: true,
    },
  );

  assert.equal(readiness.status, 'action_required');
  const publicUrlCheck = readiness.components
    .find(component => component.key === 'base')
    ?.checks.find(check => check.key === 'public_app_url');
  assert.equal(publicUrlCheck?.status, 'fail');
});
