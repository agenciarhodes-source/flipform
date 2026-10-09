from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_jev_hint_carries_the_conversation_moment_but_no_scores():
    engine = read("lib/flip-ai/decision-engine.ts")
    hint = engine.split("export function decisionHint")[1].split("].join('; ');")[0]
    for kept in ["intenção=", "objeção=", "estágio=", "próxima_ação=", "humano="]:
        assert kept in hint, kept
    for removed in ["fitScore", "intentScore", "urgencyScore", "readinessScore", "confidence"]:
        assert removed not in hint, removed


def test_attendant_is_told_to_grade_the_lead_itself():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "são avaliação sua, feita com a conversa inteira e a base interna" in chat
    assert "Nunca copie números de sinais externos." in chat
