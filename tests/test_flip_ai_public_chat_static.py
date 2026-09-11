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


def test_public_shell_streams_through_server_without_tracking_or_secrets():
    shell = read("components/flip-ai/public-chat-shell.tsx")
    route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    engine = read("lib/flip-ai/public-chat.ts")
    adapter = read("lib/flip-ai/openai-responses.ts")
    assert "Assistente virtual" in shell
    assert "/api/flip-ai/public/" in shell
    assert "OPENAI_API_KEY" not in shell + route
    assert "process.env.OPENAI_API_KEY" in adapter
    assert "store: false" in adapter
    assert "stream: true" in adapter
    assert "provider: 'flip_ai'" in engine
    assert "channel: 'web'" in engine
    assert "publicChatMessageSchema" in engine
    assert ".strict()" in engine
    for forbidden in ["fbq(", "dataLayer", "QualifiedLead", "linkConversationToLead"]:
        assert forbidden not in shell + route + engine


def test_public_chat_is_idempotent_and_has_no_blind_retry():
    engine = read("lib/flip-ai/public-chat.ts")
    adapter = read("lib/flip-ai/openai-responses.ts")
    assert "requestKey" in engine
    assert "attemptToken" in engine
    assert "confirmRetry" in engine
    assert "CHAT_RESULT_AMBIGUOUS" in engine
    assert "fetchImpl || fetch" in adapter
    assert "retry" not in adapter.lower()


def test_public_chat_quota_is_server_scoped_atomic_and_fail_closed():
    engine = read("lib/flip-ai/public-chat.ts")
    resolver = read("lib/flip-ai/public-agent.ts")
    migration = read("prisma/migrations/20260910130000_flip_ai_public_text_runtime/migration.sql")
    assert "scope: 'tenant'" in engine
    assert "scope: 'agent'" in engine
    assert "scope: 'conversation'" in engine
    assert "ON CONFLICT (tenant_id, scope, scope_key, window_start)" in engine
    assert "WHERE flip_ai_rate_limit_buckets.request_count <" in engine
    assert "rejected_count = flip_ai_rate_limit_buckets.rejected_count + 1" in engine
    assert "flip_ai_rate_limit_buckets" in resolver
    assert "CREATE TABLE \"flip_ai_rate_limit_buckets\"" in migration


def test_inbox_filters_flip_ai_before_pagination():
    inbox = read("app/api/inbox/conversations/route.ts")
    where_block = inbox.split("const where =", 1)[1].split("const baseConversations", 1)[0]
    assert "provider: 'meta'" in where_block
    assert "{ in: ['whatsapp', 'instagram'] }" in where_block
    assert "take: 100" in inbox


def test_public_chat_route_has_bounded_stage_timeouts():
    route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    engine = read("lib/flip-ai/public-chat.ts")
    assert "maxDuration = 120" in route
    assert "timeoutMs: 55_000" in route
    assert "timeoutMs: 20_000" in engine


def test_flip_ai_lead_capture_reuses_crm_rotation_and_tracking():
    capture = read("lib/flip-ai/lead-capture.ts")
    service = read("lib/leads/ensure-from-conversation.ts")
    route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    shell = read("components/flip-ai/public-chat-shell.tsx")
    tracking = read("lib/tracking.ts")
    assert "hasUserEvidence" in capture
    assert "direction: 'inbound'" in capture
    assert "provider: 'flip_ai'" in capture
    assert "requireValidPhone: true" in capture
    assert "ensureLeadFromConversation({" in capture
    assert "assignLeadByRotationId" in service
    assert "kind !== 'created' && outcome.kind !== 'linked_existing'" in capture
    assert "source: 'flip_ai'" in capture
    assert "metaLeadEventId: eventId" in capture
    assert "try {" in capture and "dispatchFormSubmissionTracking({" in capture
    assert "captureFlipAiLead" in route
    assert "Lead capture is isolated from the valid conversation response" in route
    assert "fireMetaLeadPixel" in shell
    assert "firePublicGtmLeadEvent" in shell
    assert "'flip_ai'" in tracking
    assert "QualifiedLead" not in capture + route


def test_structured_identity_is_evidence_not_execution_authority():
    engine = read("lib/flip-ai/public-chat.ts")
    capture = read("lib/flip-ai/lead-capture.ts")
    assert "PUBLIC_CHAT_DECISION_FORMAT" in engine
    assert "additionalProperties: false" in engine
    assert "nunca deduza, complete ou invente dados" in engine
    assert "isValidBrazilianPhone" in capture
    assert "nameSeen && phoneSeen" in capture
    assert "tenantId: input.runtime.tenantId" in capture
