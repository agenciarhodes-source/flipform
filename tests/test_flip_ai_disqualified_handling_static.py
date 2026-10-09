from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_disqualified_conversation_is_not_registered_as_a_lead():
    capture = read("lib/flip-ai/lead-capture.ts")
    body = capture.split("export async function captureFlipAiLead")[1]
    gate = body.index("if (input.finalClassification === 'disqualified') return null;")
    stored = body.index("if (storedQualification?.classification === 'disqualified') return null;")
    # Both gates run before the Lead is created and before any tracking is dispatched.
    assert gate < stored < body.index("ensureLeadFromConversation(") < body.index("dispatchFormSubmissionTracking(")
    route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    assert "finalClassification: decision.qualification?.classification," in route
    assert "finalClassification: turn.qualification?.classification," in route


def test_capture_gate_never_deletes_or_moves_existing_leads():
    body = read("lib/flip-ai/lead-capture.ts")
    for forbidden in [".delete(", ".deleteMany(", "lead.update(", "stageId:  ", "leadStageHistory"]:
        assert forbidden not in body, forbidden


def test_final_disqualification_overrides_the_per_message_reading():
    policy = read("lib/flip-ai/lead-intelligence-policy.ts")
    override = policy.split("export function applyFinalDisqualification")[1].split("const INTENT_STRENGTH")[0]
    assert "classification: 'disqualified'," in override
    assert "temperature: 'cold'," in override
    assert "FLIP_AI_DISQUALIFIED_SCORE_CAP" in override
    server = read("lib/flip-ai/lead-intelligence.ts")
    assert "final?.classification === 'disqualified'" in server
    assert "applyFinalDisqualification(snapshot, final)" in server
    assert "FLIP_AI_DISQUALIFIED_SCORE_CAP = 10;" in read("lib/flip-ai/qualification-score.ts")
    assert "finalQualificationApplied" in read("components/lead-detail-modal.tsx")


def test_agent_speaks_for_the_company_without_exposing_a_knowledge_lookup():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "Fale sempre em nome da empresa, com segurança." in chat
    assert "Não trabalhamos com isso." in chat
    assert "esse ponto é definido com o time" in chat
    assert "não peça nome nem telefone e não ofereça registrar interesse" in chat
    assert "Se não souber, diga com clareza." not in chat
    # Still never invents facts.
    assert "Não invente informações" in chat
