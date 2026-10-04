from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr343_handoff_reuses_existing_state_without_new_ai_provider_call():
    policy = read("lib/flip-ai/human-handoff-policy.ts")
    server = read("lib/flip-ai/human-handoff.ts")
    assert "qualification" in policy
    assert "conversation_state" in policy
    assert "deterministic" in policy
    for forbidden in ["streamOpenAiText", "runJevConversationDecision", "fetch(", "OPENAI_API_KEY", "TYPESAFE_API_KEY"]:
        assert forbidden not in server


def test_pr343_handoff_query_is_tenant_and_lead_scoped_and_read_only():
    server = read("lib/flip-ai/human-handoff.ts")
    assert "where: { id: input.leadId, tenantId: input.tenantId }" in server
    assert "provider: 'flip_ai'" in server
    for forbidden in [
        "prisma.lead.update",
        "prisma.lead.create",
        "prisma.conversation.update",
        "prisma.note.create",
        "moveLead",
        "createAppointment",
        "recordFlipAiCreditEntry",
    ]:
        assert forbidden not in server


def test_pr343_lead_api_resolves_handoff_only_after_rbac_access_check():
    api = read("app/api/leads/[id]/route.ts")
    assert "assertCanAccessLead(session, lead)" in api
    assert "getFlipAiHumanHandoff" in api
    assert api.index("assertCanAccessLead(session, lead)") < api.index("getFlipAiHumanHandoff({")
    assert "flipAiHumanHandoff" in api


def test_pr343_ui_makes_handoff_advisory_and_continuity_first():
    modal = read("components/lead-detail-modal.tsx")
    assert "Resumo para atendimento" in modal
    assert "Como retomar" in modal
    assert "Informações já disponíveis" in modal
    assert "Encaminhamento recomendado" in modal
    assert "sem nova chamada de IA" in modal
    assert "não move o lead, não atribui vendedor e não envia mensagem automaticamente" in modal
    assert "peso 30%" in modal


def test_pr343_handoff_policy_explicitly_avoids_restarting_the_interview():
    policy = read("lib/flip-ai/human-handoff-policy.ts")
    assert "evite repetir perguntas já respondidas" in policy
    assert "Considere primeiro a objeção" in policy
    assert "Próximo passo sugerido" in policy


def test_pr343_has_no_schema_migration_or_automatic_crm_mutation():
    schema = read("prisma/schema.prisma")
    policy = read("lib/flip-ai/human-handoff-policy.ts")
    server = read("lib/flip-ai/human-handoff.ts")
    assert "FlipAiHumanHandoff" not in schema
    for content in [policy, server]:
        for forbidden in ["ALTER TABLE", "CREATE TABLE", "DROP TABLE", "prisma.lead.update"]:
            assert forbidden not in content
