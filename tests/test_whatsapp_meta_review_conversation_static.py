from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTE = ROOT / 'app/api/admin/integrations/whatsapp/test-conversation/route.ts'
CARD = ROOT / 'app/admin/(secure)/integrations/whatsapp-meta-test-binding-card.tsx'


def read(path: Path) -> str:
    return path.read_text()


def test_meta_review_conversation_route_is_platform_admin_only_and_test_scoped():
    route = read(ROUTE)
    assert 'withPlatformAdmin' in route
    assert 'confirmTestRecipient: z.literal(true)' in route
    assert "action: 'WHATSAPP_META_TEST_NUMBER_BOUND'" in route
    assert "status: 'connected'" in route


def test_meta_review_conversation_uses_existing_conversation_core_without_fake_inbound_message():
    route = read(ROUTE)
    assert 'ensureConversation({' in route
    assert "provider: 'meta'" in route
    assert "channel: 'whatsapp'" in route
    assert 'recordInboundMessage' not in route
    assert 'prisma.message.create' not in route
    assert "source: 'meta_app_review_outbound_test'" in route


def test_meta_review_conversation_never_accepts_provider_tokens_or_asset_authority_from_browser():
    route = read(ROUTE)
    forbidden = ('accessToken', 'appSecret', 'wabaId', 'phoneNumberId: z.', 'systemUser')
    for item in forbidden:
        assert item not in route


def test_meta_review_conversation_is_audited_without_storing_full_recipient_in_audit():
    route = read(ROUTE)
    assert "action: 'WHATSAPP_META_REVIEW_TEST_CONVERSATION_PREPARED'" in route
    assert 'recipientLast4' in route
    audit_segment = route.split("action: 'WHATSAPP_META_REVIEW_TEST_CONVERSATION_PREPARED'", 1)[1]
    assert 'recipientPhone:' not in audit_segment


def test_admin_card_explains_that_no_inbound_message_is_simulated():
    card = read(CARD)
    assert 'Preparar conversa para o screencast' in card
    assert 'Nenhuma mensagem recebida é simulada.' in card
    assert "/api/admin/integrations/whatsapp/test-conversation" in card
    assert 'Preparar conversa no Inbox' in card
