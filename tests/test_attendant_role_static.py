from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_profile_table_is_additive_and_not_linked_to_flip_ai_tables():
    migration = read("prisma/migrations/20261028120000_ai_attendant_profiles/migration.sql")
    assert 'CREATE TABLE IF NOT EXISTS "ai_attendant_profiles"' in migration
    assert "CHECK (\"role\" IN ('analyst', 'closer'))" in migration
    assert "DROP" not in migration and "ALTER TABLE" not in migration
    assert 'REFERENCES "flip_ai_' not in migration
    schema = read("prisma/schema.prisma")
    assert '@@map("ai_attendant_profiles")' in schema


def test_profile_reaches_site_and_whatsapp():
    agent = read("lib/flip-ai/public-agent.ts")
    assert "loadAttendantRole(endpoint.agent.tenantId, endpoint.agent.id)" in agent
    chat = read("lib/flip-ai/public-chat.ts")
    assert "buildHumanConversationGuidance(inputMode, runtime.attendantRole)" in chat
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "role: runtime.attendantRole," in reply
    assert "SEU PAPEL É A TRIAGEM (prioridade máxima), E SÓ ELA" in reply


def test_owner_or_admin_picks_the_profile_on_the_agent_card():
    route = read("app/api/flip-ai/agents/[id]/profile/route.ts")
    assert "requireFlipAiAccess(prisma, session)" in route
    assert "z.enum(ATTENDANT_ROLES)" in route
    server = read("lib/flip-ai/attendant-role-server.ts")
    assert "prisma.flipAiAgent.findFirst({ where: { id: input.agentId, tenantId: input.tenantId }" in server
    manager = read("components/flip-ai/agent-draft-manager.tsx")
    assert "<AgentRolePicker agentId={agent.id} />" in manager
