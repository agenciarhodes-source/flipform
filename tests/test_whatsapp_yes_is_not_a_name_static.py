from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_a_yes_is_never_taken_as_the_name():
    rules = (ROOT / "lib/whatsapp-ai/eligibility.ts").read_text(encoding="utf-8")
    assert "if (isAffirmation(text)) return profileFirstName || null;" in rules
    assert "export function plausibleName(value: string | null | undefined)" in rules
    reply = (ROOT / "lib/whatsapp-ai/reply.ts").read_text(encoding="utf-8")
    assert "preferredName: alignNameSpelling(plausibleName(parsed.identity?.name) || nameInAnswer, knownNames)," in reply
