from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_flip_ai_web_transport_is_explicit_and_provider_scoped():
    core = read("lib/conversations/core.ts")
    assert "'web'" in core
    assert "'flip_ai'" in core
    assert "flip_ai: new Set<ConversationChannel>(['web'])" in core
    assert "meta: new Set<ConversationChannel>(['whatsapp', 'instagram'])" in core
    assert "assertTransport(provider, channel)" in core
    assert "| { channel: 'web'; provider: 'flip_ai' }" in core


def test_public_agent_resolution_is_server_authoritative_and_fail_closed():
    resolver = read("lib/flip-ai/public-agent.ts")
    assert "customDomainHost?: string | null" in resolver
    signature = resolver.split("export async function resolvePublicFlipAiAgent(input:", 1)[1].split("}):", 1)[0]
    assert "tenantId" not in signature
    assert "status: 'active'" in resolver
    assert "verificationStatus: 'verified'" in resolver
    assert "sslStatus: 'active'" in resolver
    assert "endpoint.agent.status !== 'published'" in resolver
    assert "canServeFlipAiPublic" in resolver
    assert "status: 'completed'" in resolver
    assert "OPENAI_API_KEY" not in resolver


def test_public_chat_reuses_existing_custom_domain_rewrite():
    middleware = read("middleware.ts")
    custom_page = read("app/custom-domain/chat/[slug]/page.tsx")
    platform_page = read("app/chat/[slug]/page.tsx")
    assert "`/custom-domain${pathname}`" in middleware
    assert "headers().get('host')" in custom_page
    assert "resolvePublicFlipAiAgent" in custom_page
    assert "resolvePublicFlipAiAgent" in platform_page
    assert "searchParams" not in custom_page + platform_page


def test_public_shell_does_not_start_ai_or_tracking_early():
    shell = read("components/flip-ai/public-chat-shell.tsx")
    assert "Assistente virtual" in shell
    assert "disabled" in shell
    assert "OPENAI" not in shell
    assert "fbq(" not in shell
    assert "dataLayer" not in shell
