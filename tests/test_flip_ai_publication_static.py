from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_publication_is_server_authoritative_and_audited():
    publication = read("lib/flip-ai/publication.ts")
    route = read("app/api/flip-ai/agents/[id]/publication/route.ts")
    public_agent = read("lib/flip-ai/public-agent.ts")

    assert "requireFlipAiAccess" in publication
    assert "tenant_id = ${tenantId}" in publication
    assert "status IN ('draft', 'published')" in publication
    assert "FOR UPDATE" in publication
    assert "AGENT_NOT_READY" in publication
    assert "auditLog.create" in publication
    assert "action: input.action === 'publish' ? 'published' : 'unpublished'" in publication
    assert "agentPublicationSchema" in route
    assert "withFlipAiSession" in route
    assert "endpoint.agent.status !== 'published'" in public_agent


def test_publication_ui_does_not_accept_tenant_or_provider_configuration():
    policy = read("lib/flip-ai/policy.ts")
    manager = read("components/flip-ai/agent-draft-manager.tsx")

    assert "agentPublicationSchema" in policy
    assert ".strict()" in policy
    assert "togglePublication" in manager
    assert "tenantId" not in manager
    assert "OPENAI_API_KEY" not in manager
    assert "pixel" not in manager.lower()
