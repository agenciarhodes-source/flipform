from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr347_migration_is_additive_and_existing_agents_fail_closed():
    sql = read("prisma/migrations/20261005190000_flip_ai_agent_action_capabilities/migration.sql")
    assert 'ADD COLUMN "action_capabilities" JSONB NOT NULL DEFAULT \'{}\'::jsonb' in sql
    upper = sql.upper()
    for forbidden in ["DROP TABLE", "DROP COLUMN", "DELETE FROM", "TRUNCATE", 'UPDATE "LEADS"', 'UPDATE "CONVERSATIONS"']:
        assert forbidden not in upper


def test_pr347_agent_contract_defaults_every_capability_off():
    policy = read("lib/flip-ai/action-capabilities.ts")
    assert "inPersonService: false" in policy
    assert "customerVisit: false" in policy
    assert "productDemo: false" in policy
    assert "inPersonScheduling: false" in policy
    assert "strict()" in policy
    assert "A coleta de agenda exige ao menos uma modalidade presencial habilitada." in policy


def test_pr347_agent_editor_persists_capabilities_only_when_schema_is_ready():
    agents = read("lib/flip-ai/agents.ts")
    editor = read("components/flip-ai/agent-draft-manager.tsx")
    assert "actionCapabilitiesSchemaReady" in agents
    assert "FLIP_AI_ACTION_CAPABILITIES_SCHEMA_NOT_READY" in agents
    assert "action_capabilities = ${JSON.stringify(input.actionCapabilities)}::jsonb" in agents
    assert "Capacidades de atendimento" in editor
    assert "Atendimento presencial" in editor
    assert "Visita ao cliente" in editor
    assert "Demonstração presencial" in editor
    assert "Coletar preferência de agenda" in editor
    assert "disabled={!workspace.actionCapabilitiesReady}" in editor


def test_pr347_public_runtime_loads_capabilities_server_side_with_pre_migration_fallback():
    loader = read("lib/flip-ai/action-capabilities-server.ts")
    public_agent = read("lib/flip-ai/public-agent.ts")
    assert "to_jsonb(a)->'action_capabilities'" in loader
    assert "parseFlipAiActionCapabilities" in loader
    assert "loadFlipAiAgentActionCapabilities" in public_agent
    assert "actionCapabilities," in public_agent
    public_projection = public_agent.split("export async function resolvePublicFlipAiAgent", 1)[1]
    assert "actionCapabilities:" not in public_projection


def test_pr347_permission_requires_both_customer_intent_and_agent_capability():
    policy = read("lib/flip-ai/action-eligibility.ts")
    assert "resolveFlipAiActionPermission" in policy
    assert "if (eligibility.visitRequested) requestedModeSupport.push(capabilities.customerVisit)" in policy
    assert "if (eligibility.productDemoRequested) requestedModeSupport.push(capabilities.productDemo)" in policy
    assert "requestedModeSupport.push(capabilities.inPersonService)" in policy
    assert "requestedModeSupport.every(Boolean)" in policy
    assert "&& capabilities.inPersonScheduling" in policy
    assert "status = 'unsupported'" in policy
    assert "effectiveNextAction = 'handoff'" in policy


def test_pr347_web_chat_uses_permission_as_authority_not_jev_desire():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "resolveFlipAiActionPermission" in chat
    assert "PERMISSÃO DE AÇÃO PRESENCIAL (regra determinística do backend)" in chat
    assert "A permissão acima é a autoridade sobre o que este agente pode oferecer" in chat
    assert "actionPermission" in chat
    for forbidden in ["createAppointment(", "calendar.create", "prisma.appointment.create", "prisma.event.create"]:
        assert forbidden not in chat


def test_pr347_lead_intelligence_uses_current_agent_capabilities():
    intelligence = read("lib/flip-ai/lead-intelligence.ts")
    policy = read("lib/flip-ai/lead-intelligence-policy.ts")
    assert 'e.agent_id AS "agentId"' in intelligence
    assert "loadFlipAiAgentActionCapabilities" in intelligence
    assert "actionCapabilities," in intelligence
    assert "actionPermission: FlipAiActionPermission" in policy
    assert "nextAction: actionPermission.effectiveNextAction" in policy


def test_pr347_lead_ui_distinguishes_desire_from_permission():
    modal = read("components/lead-detail-modal.tsx")
    assert "Desejo do cliente:" in modal
    assert "Permissão do agente:" in modal
    assert "Modalidade presencial não habilitada" in modal
    assert "A modalidade presencial solicitada está habilitada para este agente." in modal
    assert "não cria agenda nem compromisso" in modal


def test_pr347_does_not_modify_whatsapp_or_execute_business_actions():
    files = [
        read("lib/flip-ai/action-capabilities.ts"),
        read("lib/flip-ai/action-eligibility.ts"),
        read("lib/flip-ai/action-capabilities-server.ts"),
    ]
    combined = "\n".join(files).lower()
    assert "whatsapp" not in combined
    for forbidden in ["movelead(", "createappointment(", "prisma.lead.update(", "prisma.task.create("]:
        assert forbidden not in combined
