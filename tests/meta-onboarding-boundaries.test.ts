import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET_CURRENT = 'meta-onboarding-boundary-test-secret';

test('Meta onboarding registry keeps Ads, WhatsApp and Instagram as separate flows', async () => {
  const {
    META_ADS_ONBOARDING_PURPOSE,
    META_WHATSAPP_ONBOARDING_PURPOSE,
    META_INSTAGRAM_ONBOARDING_PURPOSE,
    META_ONBOARDING_CHANNELS,
  } = await import('../lib/meta/onboarding');

  assert.equal(META_ADS_ONBOARDING_PURPOSE, 'ads_tracking');
  assert.equal(META_WHATSAPP_ONBOARDING_PURPOSE, 'whatsapp_embedded_signup');
  assert.equal(META_INSTAGRAM_ONBOARDING_PURPOSE, 'instagram_business_login');

  assert.deepEqual(META_ONBOARDING_CHANNELS.ads_tracking.requiredScopes, [
    'ads_read',
    'ads_management',
    'business_management',
  ]);
  assert.deepEqual(META_ONBOARDING_CHANNELS.whatsapp_embedded_signup.requiredScopes, [
    'business_management',
    'whatsapp_business_management',
    'whatsapp_business_messaging',
  ]);
  assert.deepEqual(META_ONBOARDING_CHANNELS.instagram_business_login.requiredScopes, [
    'instagram_business_basic',
    'instagram_business_manage_messages',
  ]);
  assert.equal(META_ONBOARDING_CHANNELS.ads_tracking.persistence, 'tenant_meta_connections');
  assert.equal(META_ONBOARDING_CHANNELS.whatsapp_embedded_signup.persistence, 'separate_channel_connection_required');
  assert.equal(META_ONBOARDING_CHANNELS.instagram_business_login.persistence, 'separate_channel_connection_required');
});

test('signed OAuth state cannot be replayed across Meta onboarding purposes', async () => {
  const {
    META_ADS_ONBOARDING_PURPOSE,
    META_INSTAGRAM_ONBOARDING_PURPOSE,
    META_WHATSAPP_ONBOARDING_PURPOSE,
  } = await import('../lib/meta/onboarding');
  const {
    createMetaOAuthStateForPurpose,
    verifyMetaOAuthStateForPurpose,
  } = await import('../lib/meta/oauth-state');

  const created = createMetaOAuthStateForPurpose(
    'tenant-a',
    'user-a',
    META_ADS_ONBOARDING_PURPOSE,
    1_000,
  );

  assert.equal(
    verifyMetaOAuthStateForPurpose(created.cookie, created.state, 'tenant-a', 'user-a', META_ADS_ONBOARDING_PURPOSE, 2_000),
    true,
  );
  assert.equal(
    verifyMetaOAuthStateForPurpose(created.cookie, created.state, 'tenant-a', 'user-a', META_WHATSAPP_ONBOARDING_PURPOSE, 2_000),
    false,
  );
  assert.equal(
    verifyMetaOAuthStateForPurpose(created.cookie, created.state, 'tenant-a', 'user-a', META_INSTAGRAM_ONBOARDING_PURPOSE, 2_000),
    false,
  );
});

test('legacy Meta OAuth state helpers remain Ads-only wrappers', async () => {
  const {
    createMetaOAuthState,
    verifyMetaOAuthState,
    verifyMetaOAuthStateForPurpose,
  } = await import('../lib/meta/oauth-state');
  const { META_WHATSAPP_ONBOARDING_PURPOSE } = await import('../lib/meta/onboarding');

  const created = createMetaOAuthState('tenant-a', 'user-a', 1_000);
  assert.equal(verifyMetaOAuthState(created.cookie, created.state, 'tenant-a', 'user-a', 2_000), true);
  assert.equal(
    verifyMetaOAuthStateForPurpose(created.cookie, created.state, 'tenant-a', 'user-a', META_WHATSAPP_ONBOARDING_PURPOSE, 2_000),
    false,
  );
});
