from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_meta_reauthorization_preserves_existing_asset_binding_and_history():
    callback = read('app/api/integrations/meta/callback/route.ts')

    assert 'existingAssetBindingPreserved: true' in callback
    for cleared_field in (
        'metaBusinessId: null',
        'metaBusinessName: null',
        'metaAdAccountId: null',
        'metaAdAccountName: null',
        'metaPixelId: null',
        'metaPixelName: null',
        'assetsSelectedAt: null',
    ):
        assert cleared_field not in callback

    assert '.delete(' not in callback
    assert '.deleteMany(' not in callback
    assert 'DELETE FROM' not in callback.upper()


def test_meta_disconnect_is_soft_revoke_not_record_deletion():
    route = read('app/api/integrations/meta/connection/route.ts')

    assert "status: 'revoked'" in route
    assert 'revokedAt:' in route
    assert 'META_CONNECTION' in route
    assert '.delete(' not in route
    assert '.deleteMany(' not in route
    assert 'DELETE FROM' not in route.upper()


def test_instagram_reconnect_and_disconnect_keep_connection_history():
    connection = read('lib/meta/instagram-connection.ts')

    assert 'tenantInstagramConnection.updateMany({' in connection
    assert "data: { status: 'revoked', revokedAt: now }" in connection
    assert 'tenantInstagramConnection.update({' in connection
    assert 'tenantInstagramConnection.create({' in connection
    assert 'INSTAGRAM_CONNECTION_REVOKED' in connection
    assert '.delete(' not in connection
    assert '.deleteMany(' not in connection
    assert 'DELETE FROM' not in connection.upper()


def test_whatsapp_reconnect_reuses_or_soft_revokes_bindings_without_deleting_history():
    complete = read('app/api/integrations/whatsapp/embedded-signup/complete/route.ts')

    assert 'const previousBinding = await tx.tenantWhatsAppConnection.findFirst({' in complete
    assert 'const reusableBinding = await tx.tenantWhatsAppConnection.findFirst({' in complete
    assert 'tenantWhatsAppConnection.updateMany({' in complete
    assert "data: { status: 'revoked', revokedAt: now }" in complete
    assert 'tenantWhatsAppConnection.update({' in complete
    assert 'tenantWhatsAppConnection.create({' in complete
    assert 'previousWabaId:' in complete
    assert 'previousPhoneNumberId:' in complete
    assert '.delete(' not in complete
    assert '.deleteMany(' not in complete
    assert 'DELETE FROM' not in complete.upper()


def test_whatsapp_disconnect_is_soft_revoke_not_record_deletion():
    route = read('app/api/integrations/whatsapp/connection/route.ts')

    assert "data: { status: 'revoked', revokedAt: now }" in route
    assert 'WHATSAPP_CONNECTION_REVOKED' in route
    assert '.delete(' not in route
    assert '.deleteMany(' not in route
    assert 'DELETE FROM' not in route.upper()


def test_saved_integration_secrets_are_preserved_when_masked_or_omitted():
    tracking = read('lib/tracking.ts')
    platform = read('lib/meta/platform-settings.ts')

    assert 'else if (!existing?.metaAccessTokenEncrypted)' in tracking
    assert 'else if (!existing?.ga4ApiSecretEncrypted)' in tracking
    assert 'let appSecretEncrypted = existing?.appSecretEncrypted || null' in platform
    assert 'let instagramAppSecretEncrypted = existing?.instagramAppSecretEncrypted || null' in platform
    assert 'let whatsappAdminSystemUserAccessTokenEncrypted = existing?.whatsappAdminSystemUserAccessTokenEncrypted || null' in platform
    assert 'let whatsappSystemUserAccessTokenEncrypted = existing?.whatsappSystemUserAccessTokenEncrypted || null' in platform
    assert 'looksMaskedSecret(input.appSecret)' in platform
    assert 'looksMaskedSecret(input.instagramAppSecret)' in platform
    assert 'looksMaskedSecret(input.whatsappAdminSystemUserAccessToken)' in platform
    assert 'looksMaskedSecret(input.whatsappSystemUserAccessToken)' in platform


def test_sensitive_integration_surfaces_do_not_mutate_crm_or_customer_records():
    paths = (
        'app/api/integrations/meta/callback/route.ts',
        'app/api/integrations/meta/connection/route.ts',
        'lib/meta/instagram-connection.ts',
        'app/api/integrations/whatsapp/connection/route.ts',
        'app/api/integrations/whatsapp/embedded-signup/complete/route.ts',
        'lib/meta/ads-diagnostics.ts',
    )
    combined = '\n'.join(read(path) for path in paths)

    for forbidden in (
        'prisma.lead.delete',
        'prisma.lead.deleteMany',
        'tx.lead.delete',
        'tx.lead.deleteMany',
        'prisma.pipeline.delete',
        'prisma.pipeline.deleteMany',
        'tx.pipeline.delete',
        'tx.pipeline.deleteMany',
        'prisma.form.delete',
        'prisma.form.deleteMany',
        'tx.form.delete',
        'tx.form.deleteMany',
        'TRUNCATE ',
        'DROP TABLE',
    ):
        assert forbidden not in combined


def test_meta_ads_diagnostics_remains_strictly_read_only():
    diagnostics = read('lib/meta/ads-diagnostics.ts')

    assert "method: 'GET'" in diagnostics
    for forbidden in (
        "method: 'POST'",
        "method: 'PUT'",
        "method: 'PATCH'",
        "method: 'DELETE'",
        'status=PAUSED',
        'effective_status=PAUSED',
    ):
        assert forbidden not in diagnostics
