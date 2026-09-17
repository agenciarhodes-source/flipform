from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTE = ROOT / 'app/api/admin/integrations/whatsapp/test-binding/route.ts'
CARD = ROOT / 'app/admin/(secure)/integrations/whatsapp-meta-test-binding-card.tsx'
PAGE = ROOT / 'app/admin/(secure)/integrations/page.tsx'


def read(path: Path) -> str:
    return path.read_text()


def test_test_binding_is_platform_admin_only_and_requires_explicit_test_confirmation():
    route = read(ROUTE)
    assert 'withPlatformAdmin' in route
    assert "confirmTestAsset: z.literal(true)" in route
    assert 'tenantId: z.string().trim().uuid()' in route
    assert 'wabaId: numericId' in route
    assert 'phoneNumberId: numericId' in route


def test_test_binding_uses_backend_universal_credentials_without_browser_tokens():
    route = read(ROUTE)
    card = read(CARD)
    assert 'getPlatformWhatsAppEmbeddedSignupCredentials' in route
    assert 'credentials.systemUserAccessToken' in route
    assert 'credentials.adminSystemUserAccessToken' in route
    assert 'accessToken' not in card
    assert 'Admin System User Access Token' not in card
    assert 'System User Access Token' not in card


def test_test_binding_validates_and_subscribes_before_persisting():
    route = read(ROUTE)
    validation = route.index('const selection = await validateWhatsAppWabaPhoneSelection')
    subscription = route.index('await subscribeAppToWhatsAppWaba')
    transaction = route.index('const connection = await prisma.$transaction')
    assert validation < subscription < transaction
    assert 'validateWhatsAppSystemUserToken' in route
    assert 'ensureSystemUserAssignedToWhatsAppWaba' in route


def test_test_binding_preserves_tenant_isolation_and_rejects_cross_tenant_asset_reuse():
    route = read(ROUTE)
    assert "tenantId: { not: tenant.id }" in route
    assert '{ wabaId: selection.waba.id }' in route
    assert '{ phoneNumberId: selection.phone.id }' in route
    assert 'WhatsAppTestBindingConflictError' in route
    assert 'FOR UPDATE' in route


def test_test_binding_is_audited_and_marks_meta_test_number_as_preprovisioned():
    route = read(ROUTE)
    assert "action: 'WHATSAPP_META_TEST_NUMBER_BOUND'" in route
    assert "action: 'WHATSAPP_PHONE_REGISTERED'" in route
    assert "source: 'meta_test_number'" in route
    assert 'bindingConnectedAt: now.toISOString()' in route


def test_test_binding_does_not_mutate_leads_ads_or_tracking():
    route = read(ROUTE)
    forbidden = (
        'prisma.lead.',
        'prisma.campaign',
        'tenantMetaConnection.update',
        'trackingEventLog',
        'metaAdAccountId',
        'metaPixelId',
    )
    for item in forbidden:
        assert item not in route


def test_admin_page_exposes_smoke_test_card_only_in_platform_admin_surface():
    page = read(PAGE)
    card = read(CARD)
    assert "import { WhatsAppMetaTestBindingCard }" in page
    assert '<WhatsAppMetaTestBindingCard />' in page
    assert 'WHATSAPP · TESTE MÍNIMO' in card
    assert 'Não use WABA de cliente real neste teste.' in card
    assert "fetch('/api/admin/integrations/whatsapp/test-binding'" in card
