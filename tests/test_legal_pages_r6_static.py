from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_privacy_policy_tells_about_ai_and_us_transfers():
    page = read("app/legal/privacy/page.tsx")
    assert "Atendimento com inteligência artificial" in page
    assert "como a OpenAI, que processa os dados nos Estados Unidos" in page
    assert "Números de CPF e CNPJ escritos nas mensagens de texto são mascarados antes do envio." in page
    assert "principalmente nos Estados Unidos" in page
    assert "art. 33 da LGPD" in page
    assert "Instagram Direct" in page and "Google Ads" in page
    # Section numbers stay in order 1..16.
    for n in range(1, 17):
        assert f"title: '{n}. " in page, n


def test_terms_cover_accounts_integrations_ai_and_end_of_contract():
    page = read("app/legal/terms/page.tsx")
    for title in ["Contas e acessos", "Integrações com serviços de terceiros",
                  "Recursos de inteligência artificial", "Encerramento e dados"]:
        assert title in page, title
    assert 'href="/legal/privacy"' in page
