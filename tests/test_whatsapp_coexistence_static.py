from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_coexistence_mode_is_explicit_and_bound_to_signed_state():
    contract = read('lib/meta/whatsapp-onboarding.ts')
    config = read('app/api/integrations/whatsapp/embedded-signup/config/route.ts')
    complete = read('app/api/integrations/whatsapp/embedded-signup/complete/route.ts')
    oauth = read('lib/meta/oauth-state.ts')

    assert "['cloud_api', 'coexistence']" in contract
    assert 'createMetaOAuthStateForPurposeWithContext' in config
    assert 'whatsappOnboardingStateContext(parsed.data.onboardingMode)' in config
    assert 'verifyMetaOAuthStateForPurposeWithContext' in complete
    assert 'whatsappOnboardingStateContext(parsed.data.onboardingMode)' in complete
    assert 'onboardingMode: parsed.data.onboardingMode' in complete
    assert 'payload.context === context' in oauth


def test_business_app_flow_uses_official_feature_type_and_skips_pin_registration():
    ui = read('app/(app)/integrations/whatsapp-embedded-signup-card.tsx')
    registration = read('app/api/integrations/whatsapp/registration/route.ts')
    health = read('lib/meta/whatsapp-connection-health.ts')

    assert "'whatsapp_business_app_onboarding'" in ui
    assert "connect('coexistence')" in ui
    assert 'Conectar WhatsApp Business existente' in ui
    assert 'connected && !coexistence' in ui
    assert "onboardingMode === 'coexistence'" in registration
    assert 'Este número já foi ativado pela Meta no modo de coexistência' in registration
    assert 'isWhatsAppCoexistenceMode(input.onboardingMode)' in health


def test_business_app_echoes_are_outbound_and_do_not_run_inbound_automations():
    runtime = read('lib/meta/whatsapp-runtime.ts')
    echo_block = runtime.split("if (field === 'smb_message_echoes')", 1)[1].split('continue;', 1)[0]

    assert "field !== 'messages' && field !== 'smb_message_echoes'" in runtime
    assert 'value?.message_echoes' in echo_block
    assert 'ensureConversation' in echo_block
    assert 'recordOutboundMessage' in echo_block
    assert "source: 'meta_whatsapp_business_app_echo'" in runtime
    assert 'prepareWhatsAppMessageCoreAutomation' not in echo_block
    assert 'recordInboundMessage' not in echo_block


def test_coexistence_change_has_no_schema_or_migration():
    contract = read('lib/meta/whatsapp-onboarding.ts')
    schema = read('prisma/schema.prisma')
    model = schema.split('model TenantWhatsAppConnection {', 1)[1].split('\n}', 1)[0]

    assert 'coexistence' in contract
    assert 'onboardingMode' not in model
