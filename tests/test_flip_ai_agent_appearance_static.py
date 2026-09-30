from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_agent_appearance_is_tenant_scoped_and_rollout_compatible():
    agents = read("lib/flip-ai/agents.ts")
    public = read("lib/flip-ai/public-agent.ts")
    assert "appearanceSchemaReady" in agents
    assert "FLIP_AI_APPEARANCE_SCHEMA_NOT_READY" in agents
    assert "to_jsonb(a)->>'avatar_url'" in agents
    assert "WHERE a.tenant_id = ${tenantId}" in agents
    assert "to_jsonb(agent)->>'avatar_url'" in public
    assert "agent.tenant_id = ${input.tenantId}" in public


def test_agent_appearance_has_strict_image_and_color_validation():
    policy = read("lib/flip-ai/policy.ts")
    avatar = read("lib/flip-ai/avatar.ts")
    assert "isValidFlipAiAvatar" in policy
    assert "chatBackgroundColor" in policy
    assert "userMessageColor" in policy
    assert "sendButtonColor" in policy
    assert "FLIP_AI_AVATAR_MAX_BYTES = 120 * 1024" in avatar
    assert r"image\/(?:png|jpeg|webp)" in avatar
    assert "http:" not in avatar and "https:" not in avatar


def test_editor_and_public_chat_apply_visual_identity_with_safe_fallbacks():
    editor = read("components/flip-ai/agent-draft-manager.tsx")
    shell = read("components/flip-ai/public-chat-shell.tsx")
    assert "AgentAvatarPicker" in editor
    assert "Prévia do chat" in editor
    assert "Mensagem do cliente" in editor
    assert "Botão de envio" in editor
    assert "Assistente da {agent.tenantName}" in shell
    assert "isValidFlipAiAvatar(agent.avatarUrl)" in shell
    assert "readableTextColor" in shell
    assert "style={{ backgroundColor }}" in shell


def test_appearance_change_does_not_touch_leads_kanban_or_tracking():
    paths = [
        "lib/flip-ai/avatar.ts",
        "components/flip-ai/agent-avatar-picker.tsx",
        "components/flip-ai/agent-draft-manager.tsx",
        "lib/flip-ai/agents.ts",
        "lib/flip-ai/public-agent.ts",
        "components/flip-ai/public-chat-shell.tsx",
        "prisma/migrations/20260930010000_flip_ai_agent_appearance/migration.sql",
    ]
    combined = "\n".join(read(path) for path in paths)
    for forbidden in [
        "prisma.lead.update",
        "prisma.lead.delete",
        "dispatchFormSubmissionTracking",
        "dispatchFlipAiQualifiedLeadTracking",
        "TenantMetaConnection",
        "TenantWhatsAppConnection",
        "DROP TABLE",
        "DELETE FROM",
        "TRUNCATE",
    ]:
        assert forbidden not in combined


def test_published_agent_can_be_edited_without_being_taken_offline():
    agents = read("lib/flip-ai/agents.ts")
    editor = read("components/flip-ai/agent-draft-manager.tsx")
    assert "status IN ('draft', 'published')" in agents
    assert "status = 'draft' AND version" not in agents
    assert "Este atendente está publicado. As alterações serão aplicadas sem retirar o chat do ar." in editor
    assert "Alterações salvas. O chat permaneceu publicado." in editor
    assert "onClick={() => editDraft(agent)}>Editar</Button>" in editor
    assert "Editar {agent.name}" not in editor
    assert "agent.status === 'draft' ? <Button variant=\"outline\" disabled={busy || !!editor || !!knowledgeAgentId || !!externalAgentId} onClick={() => editDraft(agent)}" not in editor
