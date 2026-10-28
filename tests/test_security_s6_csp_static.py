import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = (ROOT / "next.config.js").read_text(encoding="utf-8")


def strict_policy():
    block = CONFIG.split("const strictCsp = [", 1)[1].split("].join", 1)[0]
    return block


def test_signed_in_areas_get_a_strict_policy():
    strict = strict_policy()
    assert "\"script-src 'self' 'unsafe-inline'\"" in strict
    assert "unsafe-eval" not in strict
    assert "facebook" not in strict and "googletagmanager" not in strict
    assert "\"object-src 'none'\"" in strict
    for area in ("dashboard", "inbox", "leads", "kanban", "admin", "whatsapp-ai", "billing"):
        assert f"'{area}'" in CONFIG.split("const STRICT_AREAS = [", 1)[1].split("];", 1)[0], area


def test_integrations_and_public_forms_keep_their_scripts():
    areas = CONFIG.split("const STRICT_AREAS = [", 1)[1].split("];", 1)[0]
    assert "'integrations'" not in areas  # WhatsApp connection uses Facebook's SDK
    assert "'f'" not in areas and "'chat'" not in areas  # public forms and chat load GTM and the pixel
    assert "source: '/settings/:path((?!integrations).*)'" in CONFIG
    assert "https://connect.facebook.net" in CONFIG.split("const strictCsp", 1)[0]


def test_strict_rules_come_after_the_default_policy():
    assert CONFIG.index("headers: commonHeaders,") < CONFIG.index("...strictRules,")
