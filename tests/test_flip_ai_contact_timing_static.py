from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_contact_moment_drives_the_pacing_guidance():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "FLIP_AI_CONTACT_GUIDANCE[resolveContactMoment({" in chat
    assert "chronological.flatMap((message) => message.role === 'assistant' ? [message.content] : [])" in chat
    assert "Nunca termine respostas seguidas com o mesmo pedido de nome ou telefone." in chat


def test_contact_timing_is_pure_guidance_and_touches_no_lead_or_crm_data():
    timing = read("lib/flip-ai/contact-timing.ts")
    for forbidden in ["prisma", "server-only", "fetch(", "lead.update", "stageId"]:
        assert forbidden not in timing, forbidden
    for moment in ["discover_first", "ask_now", "handle_objection_first", "hold_after_request", "stop_requesting"]:
        assert moment + ":" in timing, moment
    assert "tests/flip-ai-contact-timing.test.ts" in read(".github/workflows/ci.yml")
