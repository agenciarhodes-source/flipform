from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_gojus_card_is_developer_only_and_tenant_gated():
    page=(ROOT/"app/(app)/integrations/page.tsx").read_text(encoding="utf-8")
    assert "session.role === 'developer' && await tenantHasFeature(session.tenantId, 'gojus_robot') && <GoJusIntegrationCard />" in page
    assert "if (!can(session.role, 'INTEGRATIONS_VIEW'))" in page

def test_gojus_preview_does_not_accept_or_send_credentials():
    card=(ROOT/"app/(app)/integrations/gojus-integration-card.tsx").read_text(encoding="utf-8")
    assert "DialogTrigger" in card and "DialogContent" in card
    assert "<fieldset disabled" in card
    assert "disabled>Testar conexão" in card and "disabled>Salvar integração" in card
    assert "fetch(" not in card and "localStorage" not in card and "sessionStorage" not in card
    assert "Desconectado" in card and "Acesso por navegador" in card
    assert (ROOT/"public/gojus-logo.svg").is_file()
