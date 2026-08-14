from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_tenant_cannot_start_oauth_over_platform_managed_connection():
    route = (ROOT / "app/api/integrations/meta/connect/route.ts").read_text()
    assert "META_PLATFORM_AUTHORIZATION_CONNECTED" in route
    assert "META_CONNECTION_PLATFORM_MANAGED" in route
    assert "status: 403" in route
    assert "createMetaOAuthStateForPurpose" in route


def test_tenant_cannot_disconnect_platform_managed_connection():
    route = (ROOT / "app/api/integrations/meta/connection/route.ts").read_text()
    assert "getAuthorizationMode" in route
    assert "META_CONNECTION_PLATFORM_MANAGED" in route
    assert "status: 403" in route
    assert "managedByPlatform" in route


def test_admin_managed_oauth_uses_signed_target_tenant_state():
    route = (ROOT / "app/api/admin/integrations/meta/tenant-connect/route.ts").read_text()
    state = (ROOT / "lib/meta/oauth-state.ts").read_text()
    callback = (ROOT / "app/api/integrations/meta/callback/route.ts").read_text()
    assert "withPlatformAdmin" in route
    assert "createPlatformManagedMetaOAuthStateForPurpose" in route
    assert "authorizationMode: MetaAdsAuthorizationMode" in state
    assert "readMetaOAuthStateForPurpose" in callback
    assert "session.globalRole !== 'platform_admin'" in callback
    assert "const targetTenantId = statePayload.tenantId" in callback


def test_platform_managed_mode_never_exposes_broad_asset_list_to_tenant_ui():
    ui = (ROOT / "app/(app)/integrations/integrations-client.tsx").read_text()
    selector = (ROOT / "app/(app)/integrations/meta-asset-selector.tsx").read_text()
    assert "metaConnection.managedByPlatform" in ui
    assert "lista completa de contas" in ui
    assert "gerenciada pelo administrador do FlipForm" in ui
    assert "fetch(" not in selector
    assert "<select" not in selector
