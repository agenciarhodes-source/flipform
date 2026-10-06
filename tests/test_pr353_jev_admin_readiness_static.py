from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_admin_integrations_exposes_a_synthetic_only_jev_probe():
    card = read("app/admin/(secure)/integrations/jev-readiness-card.tsx")
    page = read("app/admin/(secure)/integrations/page.tsx")
    assert "<JevReadinessCard />" in page
    assert "Testar conexão com dados fictícios" in card
    assert "method: 'POST'" in card
    assert "body:" not in card
    assert "leads, conversas, documentos ou Markdown" in card
    assert "auditoria técnica sem dados pessoais" in card


def test_admin_never_receives_or_requests_the_typesafe_key():
    card = read("app/admin/(secure)/integrations/jev-readiness-card.tsx")
    assert "TYPESAFE_API_KEY" not in card
    assert "apiKeyConfigured" in card
    assert "Chave configurada no servidor" in card
    assert "A chave nunca é retornada ao navegador" in card
    assert 'type="password"' not in card


def test_real_data_gate_is_visible_but_not_editable_from_the_browser():
    card = read("app/admin/(secure)/integrations/jev-readiness-card.tsx")
    assert "realDataProcessingApproved" in card
    assert "Dados reais bloqueados" in card
    assert "não altera nenhuma trava de produção" in card
    assert "FLIP_AI_JEV_DATA_PROCESSING_APPROVED" not in card
