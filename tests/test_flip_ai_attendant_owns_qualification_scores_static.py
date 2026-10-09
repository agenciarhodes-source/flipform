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


def test_lead_card_shows_only_the_conversation_moment_from_jev():
    modal = read("components/lead-detail-modal.tsx")
    card = modal.split("{lead.flipAiLiveIntelligence && (")[1]
    for removed in ["Comparativo de notas", "urgencyScore", "readinessScore", "engineScore",
                    "lead.flipAiLiveIntelligence.classification", "lead.flipAiLiveIntelligence.score",
                    "lead.flipAiLiveIntelligence.fitScore", "lead.flipAiLiveIntelligence.temperature"]:
        assert removed not in card, removed
    for kept in ["<strong>Intenção:</strong>", "<strong>Objeção:</strong>", "<strong>Jornada:</strong>",
                 "Próxima ação sugerida", "Esta leitura não dá nota ao lead."]:
        assert kept in card, kept


def test_handoff_priority_comes_from_the_attendant_verdict():
    policy = read("lib/flip-ai/human-handoff-policy.ts")
    priority = policy.split("function priorityOf(")[1].split("function handoffReason(")[0]
    assert "if (classification === 'qualified') return 'high' as const;" in priority
    assert "if (classification === 'disqualified') return 'low' as const;" in priority
    assert "intelligence.score" not in policy
    assert "intelligence.classification" not in policy
    assert "classification: currentQualification.classification," in read("lib/flip-ai/human-handoff.ts")
    assert "tests/flip-ai-handoff-priority.test.ts" in read(".github/workflows/ci.yml")
