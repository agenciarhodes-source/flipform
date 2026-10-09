from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_lead_api_returns_the_ai_conversation_after_the_access_check_and_tenant_scoped():
    api = read("app/api/leads/[id]/route.ts")
    assert "const flipAiConversation = await prisma.conversation.findFirst({" in api
    assert "where: { tenantId: session.tenantId, leadId: lead.id, provider: 'flip_ai' }," in api
    assert api.index("assertCanAccessLead(session, lead)") < api.index("const flipAiConversation =")
    assert "flipAiConversation," in api


def test_modal_shows_the_history_even_without_a_finished_qualification():
    modal = read("components/lead-detail-modal.tsx")
    assert "!(lead.flipAiQualifications?.length > 0) && lead.flipAiConversation?.messages?.length > 0" in modal
    assert "Conversa com o atendente de IA" in modal
    assert modal.count("Histórico da conversa") == 2
    assert "|| lead.flipAiConversation?.messages?.length > 0)" in modal


def test_attendant_finishes_the_qualification_when_handing_the_lead_to_the_team():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "Nunca encaminhe alguém deixando qualification como null." in chat
    assert "exceto quando a própria pessoa informar o dado que faltava nesta mensagem e você o preencher em identity" in chat
    # The backend still refuses a qualified result without a validated Lead.
    assert "parsed.data.classification === 'qualified' && !leadId" in read("lib/flip-ai/qualification.ts")
