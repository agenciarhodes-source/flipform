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
    assert "Assistente de {agent.tenantName}" in shell
    assert "/api/flip-ai/public/" in shell
    assert "OPENAI_API_KEY" not in shell + route
    assert "process.env.OPENAI_API_KEY" in adapter
    assert "store: false" in adapter
    assert "stream: true" in adapter
    assert "provider: 'flip_ai'" in engine
    assert "channel: 'web'" in engine
    assert "publicChatMessageSchema" in engine
    assert ".strict()" in engine
    for forbidden in ["fbq(", "dataLayer", "linkConversationToLead"]:
        assert forbidden not in shell + route + engine
    assert "QualifiedLead" not in shell
    assert "dispatchFlipAiQualifiedLeadTracking" not in shell + route + engine


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

def test_lead_capture_replay_and_runtime_destination_are_fail_closed():
    route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    engine = read("lib/flip-ai/public-chat.ts")
    resolver = read("lib/flip-ai/public-agent.ts")
    assert "leadIdentity" in engine
    assert "storedLeadIdentity" in engine
    assert "decision: turn.identity" in route
    assert "endpoint.agent.pipeline.isArchived" in resolver
    assert "endpoint.agent.initialStage.pipelineId !== endpoint.agent.pipelineId" in resolver
    assert "endpoint.agent.initialStage.isArchived" in resolver


def test_flip_ai_meta_request_is_bounded_without_retry():
    capture = read("lib/flip-ai/lead-capture.ts")
    tracking = read("lib/tracking.ts")
    meta = read("lib/tracking/meta-capi.ts")
    assert "metaRequestTimeoutMs: 8_000" in capture
    assert "timeoutMs: context.metaRequestTimeoutMs" in tracking
    assert "controller.abort()" in meta
    assert "signal: controller?.signal" in meta
    assert "retry" not in meta.lower()


def test_qualification_engine_is_server_authoritative_tenant_scoped_and_idempotent():
    engine = read("lib/flip-ai/qualification.ts")
    route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    tracking = read("lib/tracking.ts")
    assert "flipAiFinalQualificationSchema" in engine
    assert "classification: z.enum(['qualified', 'nurture', 'disqualified', 'insufficient'])" in engine
    assert "tenantId: input.runtime.tenantId" in engine
    assert "parsed.data.classification === 'qualified' && !leadId" in engine
    assert "`flip-ai-qualified:${input.conversationId}`" in engine
    assert "qualifiedLeadTrackingStatus: 'pending'" in engine
    assert "qualifiedLeadTrackingStatus: 'processing'" in engine
    assert "qualifiedLeadTrackingStatus: 'ambiguous'" in engine
    assert "dispatchFlipAiQualifiedLeadTracking" in engine + tracking
    assert "finalizeFlipAiQualification" in route
    assert "Qualification persistence/tracking never invalidates a confirmed reply or Lead" in route
    for forbidden in ["lead.update(", "assignedToId:"]:
        assert forbidden not in engine


def test_qualification_retrieval_and_output_are_structured_and_bounded():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "required: ['reply', 'identity', 'qualification']" in chat
    assert "qualification: flipAiFinalQualificationSchema.nullable()" in chat
    assert "Critérios de qualificação, perfil ideal" in chat
    assert "embeddings.length !== 2" in chat
    assert ".slice(0, 7)" in chat
    assert "evidenceMessageIds: history.map" in chat
    assert "qualificationEvidenceMessageIds" in chat
    assert "Nunca marque qualified quando o backend ainda não confirmar nome e telefone validados" in chat


def test_entry_context_reuses_message_metadata_without_schema_or_tracking_changes():
    chat = read("lib/flip-ai/public-chat.ts")
    shell = read("components/flip-ai/public-chat-shell.tsx")
    assert "entryAttribution" in chat
    assert "buildPublicEntryContext" in chat
    assert "CONTEXTO DE ENTRADA NÃO CONFIÁVEL" in chat
    assert "profundidade da conversa deve ser adaptativa" in chat
    assert "fbclid" not in chat.split("export function buildPublicEntryContext", 1)[1].split("}", 1)[0]
    assert "Olá! Sou ${agent.name}, da ${agent.tenantName}. Como posso ajudar você hoje?" in shell


def test_public_chat_balances_discovery_with_contact_capture():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "normalmente use no máximo três frases curtas e cerca de 70 palavras" in chat
    assert "nunca faça mais de três perguntas de diagnóstico" in chat
    assert "CAPTURA PRIORITÁRIA" in chat
    assert "peça agora o dado de contato que falta" in chat
    assert "Depois de pedir contato, não acrescente outra pergunta de diagnóstico" in chat


def test_lead_detail_reuses_existing_crm_surface_for_flip_ai():
    api = read("app/api/leads/[id]/route.ts")
    modal = read("components/lead-detail-modal.tsx")
    assert "flipAiQualifications" in api
    assert "tenantId" in api
    assert "Flip AI" in modal
    assert "Fit" in modal and "Intent" in modal
    assert "Histórico da conversa" in modal


def test_pr274_migration_is_additive_and_runtime_remains_fail_closed():
    migration = read("prisma/migrations/20260911160000_flip_ai_qualification_engine/migration.sql")
    resolver = read("lib/flip-ai/public-agent.ts")
    assert 'CREATE TABLE "flip_ai_qualifications"' in migration
    assert 'FOREIGN KEY ("tenant_id", "conversation_id")' in migration
    assert '"qualified_lead_event_id"' in migration
    assert 'flip_ai_qualifications' in resolver
    upper = migration.upper()
    for forbidden in ["DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM", 'UPDATE "LEADS"', 'UPDATE "CONVERSATIONS"']:
        assert forbidden not in upper


def test_long_chat_identity_and_abandoned_dispatch_are_recovered_safely():
    chat = read("lib/flip-ai/public-chat.ts")
    qualification = read("lib/flip-ai/qualification.ts")
    assert "linkedIdentityVerified = false" in chat
    assert "isValidBrazilianPhone(identity.lead.phone)" in chat
    assert "Não peça esses dados novamente" in chat
    assert "QUALIFICATION_DISPATCH_STALE_MS" in qualification
    assert "updatedAt: { lt:" in qualification
    assert "qualifiedLeadTrackingStatus: 'ambiguous'" in qualification
    stale_block = qualification.split("A terminated serverless invocation", 1)[1]
    assert "dispatchFlipAiQualifiedLeadTracking" not in stale_block.split("else if", 1)[0]
