from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_meta_onboarding_registry_separates_channel_purposes():
    registry = (ROOT / "lib/meta/onboarding.ts").read_text()
    assert "META_ADS_ONBOARDING_PURPOSE = 'ads_tracking'" in registry
    assert "META_WHATSAPP_ONBOARDING_PURPOSE = 'whatsapp_embedded_signup'" in registry
    assert "META_INSTAGRAM_ONBOARDING_PURPOSE = 'instagram_business_login'" in registry
    assert "'ads_read', 'ads_management', 'business_management'" in registry
    assert "'whatsapp_business_management', 'whatsapp_business_messaging'" in registry
    assert "'instagram_business_basic', 'instagram_business_manage_messages'" in registry
    assert "persistence: 'tenant_meta_connections'" in registry
    assert "persistence: 'tenant_whatsapp_connections'" in registry
    assert "persistence: 'tenant_instagram_connections'" in registry
    assert "separate_channel_connection_required" not in registry


def test_meta_oauth_state_is_signed_for_one_explicit_purpose_and_mode():
    state = (ROOT / "lib/meta/oauth-state.ts").read_text()
    assert "purpose: MetaOnboardingPurpose" in state
    assert "authorizationMode: MetaAdsAuthorizationMode" in state
    assert "createMetaOAuthStateForPurpose" in state
    assert "createPlatformManagedMetaOAuthStateForPurpose" in state
    assert "verifyMetaOAuthStateForPurpose" in state
    assert "readMetaOAuthStateForPurpose" in state
    assert "payload.purpose !== purpose" in state
    assert "payload.authorizationMode === 'client_authorized'" in state
    assert "payload.authorizationMode === 'platform_managed'" in state
    assert "META_ADS_ONBOARDING_PURPOSE" in state


def test_existing_meta_connect_and_callback_remain_ads_only():
    connect = (ROOT / "app/api/integrations/meta/connect/route.ts").read_text()
    callback = (ROOT / "app/api/integrations/meta/callback/route.ts").read_text()
    assert "createMetaOAuthStateForPurpose" in connect
    assert "META_ADS_ONBOARDING_PURPOSE" in connect
    assert "readMetaOAuthStateForPurpose" in callback
    assert "META_ADS_ONBOARDING_PURPOSE" in callback
    assert "tenantMetaConnection" in callback
    assert "whatsapp" not in callback.lower()
    assert "instagram" not in callback.lower()


def test_boundary_change_does_not_add_channel_credentials_to_ads_schema():
    schema = (ROOT / "prisma/schema.prisma").read_text()
    start = schema.index("model TenantMetaConnection {")
    end = schema.index("\n}\n", start)
    model = schema[start:end]
    assert "metaAdAccountId" in model
    assert "metaPixelId" in model
    assert "whatsapp" not in model.lower()
    assert "instagram" not in model.lower()
