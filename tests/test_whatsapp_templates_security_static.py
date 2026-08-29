from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTE = (ROOT / "app/api/integrations/whatsapp/templates/route.ts").read_text()
CLIENT = (ROOT / "app/(app)/integrations/whatsapp-templates-card.tsx").read_text()
HELPER = (ROOT / "lib/meta/whatsapp-templates.ts").read_text()
PAGE = (ROOT / "app/(app)/integrations/page.tsx").read_text()


def test_template_routes_require_existing_integration_permissions():
    assert "withPermission('INTEGRATIONS_VIEW'" in ROUTE
    assert "withPermission('INTEGRATIONS_MANAGE'" in ROUTE


def test_waba_is_derived_from_authenticated_tenant_not_request_payload():
    assert "tenantId: session.tenantId" in ROUTE
    assert "prisma.tenantWhatsAppConnection.findFirst" in ROUTE
    assert "where: { tenantId, status: 'connected' }" in ROUTE
    assert "body.wabaId" not in ROUTE
    assert "raw.wabaId" not in ROUTE
    assert "wabaId: z." not in ROUTE


def test_universal_credentials_stay_server_side():
    assert "getPlatformWhatsAppRuntimeCredentials" in ROUTE
    assert "import 'server-only'" in HELPER
    assert "accessToken" not in CLIENT
    assert "appSecret" not in CLIENT
    assert "wabaId" not in CLIENT


def test_template_creation_does_not_duplicate_template_content_in_database():
    assert "WHATSAPP_TEMPLATE_CREATED" in ROUTE
    assert "whatsapp_message_template" in ROUTE
    assert "templateContent" not in ROUTE
    assert "messageTemplate.create" not in ROUTE


def test_integrations_page_exposes_templates_next_to_official_signup():
    assert "WhatsAppEmbeddedSignupCard" in PAGE
    assert "WhatsAppTemplatesCard" in PAGE
    assert 'id="whatsapp-templates"' in PAGE
