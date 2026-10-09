from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_disqualified_conversation_still_becomes_a_cold_lead_without_the_lead_event():
    capture = read("lib/flip-ai/lead-capture.ts")
    body = capture.split("export async function captureFlipAiLead")[1]
    assert "return null;" not in body.split("const disqualified =")[1].split("if (!(await hasUserEvidence")[0]
    assert "temperature: disqualified ? 'cold' : 'warm'," in body
    # The Lead is created first; the tracking event is skipped for a disqualified conversation.
    assert (body.index("ensureLeadFromConversation(") < body.index("if (disqualified) return {};")
            < body.index("dispatchFormSubmissionTracking("))
    assert "data: { leadId: outcome.leadId }," in body
    route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    assert "finalClassification: decision.qualification?.classification," in route
    assert "finalClassification: turn.qualification?.classification," in route


def test_only_the_attendant_judges_out_of_profile_and_never_on_the_first_message():
    timing = read("lib/flip-ai/contact-timing.ts")
    assert "out_of_profile" not in timing
    assert "fitScore" not in timing
    chat = read("lib/flip-ai/public-chat.ts")
    assert "Nunca desqualifique na primeira mensagem nem com base em sinais de triagem." in chat
    assert "Perguntar preço, comparar com concorrente, desconfiar, pedir prazo ou dizer que vai pensar nunca desqualifica" in chat
    engine = read("lib/flip-ai/qualification.ts")
    assert "FLIP_AI_MIN_INBOUND_TO_DISQUALIFY = 2;" in engine
    assert "if (inboundMessages < FLIP_AI_MIN_INBOUND_TO_DISQUALIFY) return null;" in engine


def test_capture_gate_never_deletes_or_moves_existing_leads():
    body = read("lib/flip-ai/lead-capture.ts")
    for forbidden in [".delete(", ".deleteMany(", "lead.update(", "lead.updateMany(", "stageId:  ", "leadStageHistory"]:
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


def test_agent_speaks_for_the_company_without_exposing_a_knowledge_lookup():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "Fale sempre em nome da empresa, com segurança." in chat
    assert "Não trabalhamos com isso." in chat
    assert "esse ponto é definido com o time" in chat
    assert "não peça nome nem telefone e não ofereça registrar interesse" in chat
    assert "Se não souber, diga com clareza." not in chat
    # Still never invents facts.
    assert "Não invente informações" in chat
