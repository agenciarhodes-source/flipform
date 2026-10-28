from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_switching_to_closer_takes_back_the_handed_over_cases():
    route = read("app/api/flip-ai/agents/[id]/profile/route.ts")
    assert "if (previous === 'analyst' && role === 'closer') {" in route
    assert "after(async () => {" in route
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "if (takeover) extraUserNotes.push(CLOSER_TAKEOVER_NOTE);" in reply
    assert "${takeover ? 'closer:' : ''}${latestInbound.id}" in reply
    assert "if (!takeover && outboundAt && outboundAt >= inboundAt)" in reply
    assert "input.trigger === 'closer_takeover') return { answer: true };" in read("lib/whatsapp-ai/eligibility.ts")
