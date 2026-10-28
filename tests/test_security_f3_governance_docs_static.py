import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs/seguranca"
FILES = [
    "00-LEIA-PRIMEIRO.md", "01-politica-seguranca-informacao.md", "02-controle-de-acesso.md",
    "03-resposta-a-incidentes.md", "04-backup-e-recuperacao.md", "05-fornecedores.md",
    "06-registro-tratamento-dados-lgpd.md", "07-desenvolvimento-seguro.md", "08-registro-de-riscos.md",
]


def test_every_governance_document_exists_with_version_and_owner():
    for name in FILES:
        text = (DOCS / name).read_text(encoding="utf-8")
        assert "**Versão:**" in text, name
        assert "Revisão" in text, name


def test_the_guide_links_to_every_document_and_links_resolve():
    guide = (DOCS / "00-LEIA-PRIMEIRO.md").read_text(encoding="utf-8")
    for name in FILES[1:]:
        assert f"]({name})" in guide, name
    for name in FILES:
        for target in re.findall(r"\]\(([0-9][^)#]+\.md)\)", (DOCS / name).read_text(encoding="utf-8")):
            assert (DOCS / target).exists(), (name, target)


def test_tests_cited_in_the_documents_exist():
    for name in ["02-controle-de-acesso.md", "07-desenvolvimento-seguro.md"]:
        for test in re.findall(r"`((?:test_|security-)[\w.-]+\.(?:py|ts))`", (DOCS / name).read_text(encoding="utf-8")):
            assert (ROOT / "tests" / test).exists(), (name, test)
