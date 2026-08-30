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

test('credential probe converts decryption/runtime errors into unreadable state', async () => {
  const { probeCredentialReadability } = await import('../lib/meta/platform-readiness');

  assert.equal(await probeCredentialReadability(async () => ({ token: 'loaded' })), true);
  assert.equal(await probeCredentialReadability(async () => null), false);
  assert.equal(await probeCredentialReadability(async () => {
    throw new Error('cannot decrypt');
  }), false);
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

test('Ads and WhatsApp rollout is not blocked by optional Instagram diagnostics', async () => {
  const { buildMetaPlatformReadiness } = await import('../lib/meta/platform-readiness');
  const { buildMetaRolloutReadiness } = await import('../lib/meta/platform-rollout-readiness');
  const settings = configuredSettings();
  settings.instagramAppId = '';
  settings.instagramAppSecretConfigured = false;
  settings.instagramLoginConfigured = false;

  const diagnostics = buildMetaPlatformReadiness(
    settings as any,
    {
      ...readableProbes,
      instagramLoginReadable: false,
      instagramWebhookSecretReadable: false,
    },
    {
      nodeEnv: 'production',
      appUrl: 'https://app.flipform.com.br',
      instagramWebhookVerifyTokenConfigured: false,
      whatsappWebhookVerifyTokenConfigured: true,
    },
  );
  const rollout = buildMetaRolloutReadiness(diagnostics);

  assert.equal(diagnostics.status, 'action_required');
  assert.equal(rollout.status, 'ready_for_external_validation');
  assert.match(rollout.summary, /Ads e WhatsApp/);
  assert.match(rollout.components.find(component => component.key === 'instagram')?.label || '', /opcional/i);
  assert.equal(rollout.components.find(component => component.key === 'instagram')?.status, 'action_required');
  assert.equal(rollout.components.find(component => component.key === 'whatsapp')?.status, 'ready');
  assert.equal(rollout.components.find(component => component.key === 'whatsapp_webhook')?.status, 'ready');
});

test('universal WhatsApp runtime token validation enforces FlipForm app and messaging scopes', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      data: {
        is_valid: true,
        app_id: '123456789',
        scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
        granular_scopes: [],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

    const { validateWhatsAppPlatformRuntimeToken } = await import('../lib/meta/whatsapp');
    const result = await validateWhatsAppPlatformRuntimeToken({
      accessToken: 'runtime-token-placeholder',
      appId: '123456789',
    });

    assert.equal(result.grantedScopes.includes('whatsapp_business_management'), true);
    assert.equal(result.grantedScopes.includes('whatsapp_business_messaging'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('universal WhatsApp preflight inspects platform tokens with the app access token', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ token: string | null; authorization: string | null }> = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
      const token = url.searchParams.get('input_token');
      const headers = new Headers(init?.headers);
      calls.push({ token, authorization: headers.get('Authorization') });

      const scopes = token === 'admin-token-placeholder'
        ? ['business_management']
        : ['whatsapp_business_management', 'whatsapp_business_messaging'];

      return new Response(JSON.stringify({
        data: {
          is_valid: true,
          app_id: '123456789',
          scopes,
          granular_scopes: [],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const {
      validateWhatsAppPlatformAdminTokenForPreflight,
      validateWhatsAppPlatformRuntimeTokenForPreflight,
    } = await import('../lib/meta/whatsapp-platform-token-preflight');

    const admin = await validateWhatsAppPlatformAdminTokenForPreflight({
      accessToken: 'admin-token-placeholder',
      appId: '123456789',
      appSecret: 'app-secret-placeholder',
    });
    const runtime = await validateWhatsAppPlatformRuntimeTokenForPreflight({
      accessToken: 'runtime-token-placeholder',
      appId: '123456789',
      appSecret: 'app-secret-placeholder',
    });

    assert.equal(admin.grantedScopes.includes('business_management'), true);
    assert.equal(runtime.grantedScopes.includes('whatsapp_business_management'), true);
    assert.equal(runtime.grantedScopes.includes('whatsapp_business_messaging'), true);
    assert.deepEqual(calls, [
      { token: 'admin-token-placeholder', authorization: 'Bearer 123456789|app-secret-placeholder' },
      { token: 'runtime-token-placeholder', authorization: 'Bearer 123456789|app-secret-placeholder' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('universal WhatsApp system user validation checks membership in FlipForm Business without writes', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      data: [{ id: 'system-user-1', name: 'FlipForm WhatsApp Runtime', role: 'ADMIN' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

    const { verifyWhatsAppPlatformSystemUser } = await import('../lib/meta/whatsapp');
    const valid = await verifyWhatsAppPlatformSystemUser({
      adminSystemUserAccessToken: 'admin-token-placeholder',
      appSecret: 'app-secret-placeholder',
      businessId: 'business-1',
      systemUserId: 'system-user-1',
    });

    assert.equal(valid, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
