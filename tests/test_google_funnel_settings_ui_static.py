from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CARD = 'app/(app)/integrations/google-funnel-card.tsx'


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_page_renders_the_funnel_card_after_existing_integrations():
    page = read('app/(app)/integrations/page.tsx')
    assert "import { GoogleFunnelCard } from './google-funnel-card';" in page
    assert page.index('<IntegrationsClient />') < page.index('<GoogleFunnelCard />') < page.index('<WhatsAppEmbeddedSignupCard />')
    assert "can(session.role, 'INTEGRATIONS_VIEW')" in page


def test_card_uses_only_the_mapping_api():
    card = read(CARD)
    assert card.count("fetch(") == 4
    assert card.count('/api/integrations/google-funnel/mappings') == 4
    for forbidden in ['/api/leads', '/api/integrations/events', '/api/integrations/meta', 'tenantId', 'localStorage', 'googleapis']:
        assert forbidden not in card, forbidden


def test_card_is_honest_about_transmission_and_defaults_to_inactive():
    card = read(CARD)
    assert 'O envio ao Google Ads não está ativo para esta conta.' in card
    assert 'Modo de teste: o Google valida cada evento, mas não registra conversão.' in card
    assert "useState<TransportMode>('off')" in card
    assert 'enabled: false,' in card
    assert "optimizationRole: 'secondary'," in card
    assert 'O FlipForm não cria nem altera' in card
    assert 'O histórico de eventos é preservado.' in card
    assert 'Interna' in card


def test_card_options_match_the_server_contract():
    card = read(CARD)
    contract = read('lib/tracking/google-funnel.ts')
    for value in ['lead', 'qualified_lead', 'converted_lead', 'primary', 'secondary', 'first_entry', 'every_entry']:
        assert f"'{value}'" in contract
        assert f'{value}:' in card
    for value in ['none', 'fixed', 'purchase']:
        assert f"'{value}'" in contract
        assert f'value="{value}"' in card


def test_card_shows_the_tenant_event_log_without_lead_data():
    card = read(CARD)
    assert 'Últimos eventos do Google Ads' in card
    assert 'describeEventStatus(event)' in card
    for label in ['Enviado ao Google', 'Validado em teste, aguardando envio real', 'lead sem clique do Google Ads']:
        assert label in card
    outbox = read('lib/tracking/google-funnel-outbox.ts')
    listing = outbox.split('export async function listRecentGoogleConversionEvents')[1]
    assert 'where: { tenantId }' in listing
    for hidden in ['leadId', 'idempotencyKey', 'triggeredById', 'email', 'phone']:
        assert hidden not in listing, hidden
    route = read('app/api/integrations/google-funnel/mappings/route.ts')
    assert 'listRecentGoogleConversionEvents(session.tenantId)' in route


def test_transport_status_exposes_only_the_mode():
    transport = read('lib/tracking/google-data-manager.ts')
    describe = transport.split('export function describeGoogleFunnelTransportForTenant')[1]
    assert "return { mode: 'off' as const };" in describe
    for hidden in ['clientEmail', 'privateKey', 'loginAccountId', 'customerId']:
        assert hidden not in describe, hidden
