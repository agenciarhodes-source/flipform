"""The attendants must not tell clients not to send passwords: the office needs the gov.br access."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_instagram_rules_do_not_forbid_passwords():
    rules = (ROOT / "lib/instagram-ai/rules.ts").read_text(encoding="utf-8")
    assert "Nunca peça senhas" not in rules
    # Asking for a password on the Direct still follows the knowledge base, like any personal data.
    assert "senhas, endereço ou outros dados pessoais pelo Direct, a não ser que a base de conhecimento" in rules


def test_site_chat_notice_does_not_forbid_passwords():
    shell = (ROOT / "components/flip-ai/public-chat-shell.tsx").read_text(encoding="utf-8")
    assert "Não envie senhas" not in shell
    assert "Não envie dados bancários." in shell
