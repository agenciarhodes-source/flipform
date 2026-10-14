from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_chat_lead_takes_its_origin_from_the_campaign_and_shows_the_attendant():
    capture = read("lib/flip-ai/lead-capture.ts")
    assert "source: resolveFlipAiLeadSource(input.attribution)," in capture
    # The tracking context is unchanged: only the origin shown on the lead follows the campaign.
    assert capture.count("source: 'flip_ai',") == 1
    assert "flip_ai: 'Atendente de IA'," in read("lib/leads.ts")
    route = read("app/api/leads/[id]/route.ts")
    assert "where: { tenantId: session.tenantId, conversation: { leadId: lead.id } }," in route
    assert "flipAiAgentName," in route
    modal = read("components/lead-detail-modal.tsx")
    assert "{formatLeadSource(lead.source)}" in modal
    assert "lead.flipAiAgentName || lead.form?.name" in modal


def test_temperature_rule_still_recognises_the_attendants_own_leads():
    engine = read("lib/flip-ai/qualification.ts")
    assert "action: 'lead.flip_ai_created'," in engine
    assert "...(createdByFlipAi > 0 ? {} : { source: 'flip_ai' })," in engine
    assert "tests/flip-ai-lead-source.test.ts" in read(".github/workflows/ci.yml")
