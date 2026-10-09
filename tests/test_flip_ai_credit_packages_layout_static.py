from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLIENT = (ROOT / "components/flip-ai/credit-wallet-client.tsx").read_text(encoding="utf-8")


def test_packages_show_comparable_price_and_highlight_the_best_rate():
    assert "function centsPerMillion(item: CreditPackage)" in CLIENT
    assert "por milhão de créditos" in CLIENT
    assert "Melhor custo por crédito" in CLIENT
    assert "Economize {savings}%" in CLIENT
    assert "rate === lowestRate && savings > 0" in CLIENT


def test_package_cards_stay_in_reais_and_keep_the_server_side_purchase():
    block = CLIENT.split("storefront.packages.map((item) => {")[1].split("Preço e quantidade de créditos")[0]
    assert "void buy(item.id)" in block
    for forbidden in ["US$", "usd", "nano", "OpenAI", "estimatedOpenAiCost"]:
        assert forbidden not in block, forbidden
