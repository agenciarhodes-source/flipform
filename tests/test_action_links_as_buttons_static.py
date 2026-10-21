from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
LOGGED_IN = [ROOT / "app" / "(app)", ROOT / "app" / "admin", ROOT / "components"]
# Links that stay links: the ui primitives and source citations in the public chat.
# The public visitor chat cites sources as plain links, on purpose.
ALLOWED = {"components/ui/button.tsx", "components/flip-ai/public-chat-shell.tsx"}


def test_actions_in_the_logged_in_area_look_like_buttons_not_underlined_links():
    offenders = []
    for base in LOGGED_IN:
        for path in base.rglob("*.tsx"):
            rel = path.relative_to(ROOT).as_posix()
            if rel in ALLOWED:
                continue
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                for match in re.finditer(r'className="([^"]*)"', line):
                    classes = match.group(1).split()
                    if "underline" in classes or ("hover:underline" in classes and "font-medium" not in classes and "text-primary" in classes):
                        offenders.append(f"{rel}:{number}")
    assert offenders == []


def test_the_whatsapp_shortcuts_are_buttons():
    text = (ROOT / "components/whatsapp-ai/settings-manager.tsx").read_text(encoding="utf-8")
    assert 'href="/whatsapp-ai/costs" className={buttonVariants(' in text
    assert 'href="/whatsapp-ai/review" className={buttonVariants(' in text
    assert 'href="/whatsapp-ai/learning" className={buttonVariants(' in text
