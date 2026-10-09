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


def test_lead_card_compares_attendant_and_jev_scores_side_by_side():
    modal = read("components/lead-detail-modal.tsx")
    assert "Comparativo de notas" in modal
    assert "engine.engineScore ?? engine.score" in modal
    assert "A nota que vale para o lead é a do atendente de IA." in modal
    policy = read("lib/flip-ai/lead-intelligence-policy.ts")
    override = policy.split("export function applyFinalDisqualification")[1].split("const INTENT_STRENGTH")[0]
    # The engine's own numbers survive the disqualification override, for the comparison.
    for kept in ["engineScore: snapshot.score,", "engineFitScore: snapshot.fitScore,", "engineIntentScore: snapshot.intentScore,"]:
        assert kept in override, kept
