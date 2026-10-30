from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_side_menu_is_grouped_in_sections_without_changing_permissions():
    shell = (ROOT / "components/app-shell.tsx").read_text(encoding="utf-8")
    for title in ['"Vendas"', '"Atendimento"', '"Inteligência artificial"', '"Captação"', '"Análise"', '"Administração"']:
        assert f"title: {title}" in shell
    # Sections only change the drawing; who sees each item is still decided by navItems.
    assert "{navSections(navItems).map((section) => (" in shell
    assert "(!item.permission || can(session.role, item.permission))" in shell
