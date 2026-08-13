from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_meta_oauth_routes_and_security_invariants():
    connect = (ROOT / "app/api/integrations/meta/connect/route.ts").read_text()
    callback = (ROOT / "app/api/integrations/meta/callback/route.ts").read_text()
    connection = (ROOT / "app/api/integrations/meta/connection/route.ts").read_text()
    oauth = (ROOT / "lib/meta/oauth.ts").read_text()
    schema = (ROOT / "prisma/schema.prisma").read_text()
    assert "withPermission('INTEGRATIONS_EDIT'" in connect
    assert "withPermission('INTEGRATIONS_EDIT'" in callback
    assert "withPermission('INTEGRATIONS_VIEW'" in connection
    assert "exchangeMetaUserAccessTokenForLongLived" in callback
    assert "validation.tokenType === 'USER'" in callback
    assert "encryptIntegrationSecret(accessToken)" in callback
    assert "grantedScopes: validation.grantedScopes" in callback
    assert "const status = validation.authorizationSatisfied ? 'authorized' : 'error'" in callback
    assert "redirect(status === 'authorized' ? 'authorized' : 'permissions')" in callback
    assert "authorizationMethod: validation.diagnostics.authorizationMethod" in callback
    assert "systemUserAssetAccess: validation.diagnostics.systemUserAssetAccess" in callback
    assert "userTokenExtended" in callback
    log_payload = callback.split("console.info(", 1)[1].split("});", 1)[0]
    assert "accessToken" not in log_payload
    assert "/me/adaccounts" in oauth
    assert "assigned_ad_accounts" not in oauth
    assert "/adspixels" in oauth
    assert "Authorization: `Bearer ${accessToken}`" in oauth
    assert "appsecret_proof" in oauth
    assert "grant_type: 'fb_exchange_token'" in oauth
    assert "fb_exchange_token: input.accessToken" in oauth
    assert "authorizationSatisfied" in oauth
    assert "accessTokenEncrypted" in schema
    assert "@@unique([tenantId, metaUserId])" in schema
    assert "onDelete: SetNull" in schema
    assert "metaUserId:" not in connection


def test_legacy_meta_capi_is_untouched_by_oauth_routes():
    oauth_files = "\n".join(
        path.read_text()
        for path in (ROOT / "app/api/integrations/meta").glob("*/route.ts")
    )
    assert "sendMetaCapiEvent" not in oauth_files
    assert "metaAccessTokenEncrypted" not in oauth_files
