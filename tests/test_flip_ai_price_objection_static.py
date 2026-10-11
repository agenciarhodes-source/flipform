from pathlib import Path

CHAT = (Path(__file__).resolve().parents[1] / "lib/flip-ai/public-chat.ts").read_text(encoding="utf-8")


def test_attendant_offers_the_closest_priced_option_on_its_own():
    assert "OBJEÇÃO DE PREÇO:" in CHAT
    assert "apresente-a primeiro, por iniciativa própria" in CHAT
    assert "Não espere a pessoa perguntar se existe algo mais barato." in CHAT
    assert "Nunca responda a uma objeção de preço defendendo uma opção mais cara do que o valor citado" in CHAT


def test_price_objection_never_invents_discounts_or_plans():
    assert "Não invente desconto, condição especial nem plano que não esteja na base." in CHAT
