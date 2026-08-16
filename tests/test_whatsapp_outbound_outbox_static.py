from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTBOUND = ROOT / "lib/meta/whatsapp-outbound.ts"
RUNTIME = ROOT / "lib/meta/whatsapp-runtime.ts"
CREDENTIALS = ROOT / "lib/meta/whatsapp-runtime-credentials.ts"
ROUTE = ROOT / "app/api/conversations/[id]/messages/whatsapp/route.ts"
DOC = ROOT / "docs/operations/whatsapp-outbound-outbox.md"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_outbox_is_persisted_before_meta_request():
    src = read(OUTBOUND)
    enqueue_pos = src.index("await enqueueWhatsAppTextMessage(input)")
    begin_pos = src.index("await beginDispatch(input.tenantId, queued.message.id)")
    provider_pos = src.index("await sendMetaWhatsAppText({")
    assert enqueue_pos < begin_pos < provider_pos
    assert "status: 'queued'" in src
    assert "dispatchState: 'sending'" in src
    assert "FOR UPDATE" in src


def test_idempotency_is_tenant_scoped_and_payload_bound():
    src = read(OUTBOUND)
    assert "sha256(`${tenantId}\\u0000${idempotencyKey}`)" in src
    assert "requestFingerprint(conversationId, text)" in src
    assert "IDEMPOTENCY_CONFLICT" in src
    assert "externalMessageId" in src
    assert "direction: 'outbound'" in src


def test_retry_does_not_resend_ambiguous_delivery():
    src = read(OUTBOUND)
    assert "metadata.dispatchState === 'delivery_unknown'" in src
    assert "metadata.dispatchState === 'sending'" in src
    assert "action: 'delivery_unknown'" in src
    assert "action: 'in_progress'" in src
    assert "await markDeliveryUnknown" in src
    # Provider send exists only in the explicit send branch after the state machine.
    assert src.count("await sendMetaWhatsAppText({") == 1


def test_provider_acceptance_is_saved_before_local_finalization():
    src = read(OUTBOUND)
    acceptance_pos = src.index("await persistProviderAcceptance({")
    finalize_pos = src.index("await finalizeAcceptedMessage({", acceptance_pos)
    assert acceptance_pos < finalize_pos
    assert "providerMessageId" in src
    assert "dispatchState: 'accepted'" in src


def test_meta_send_uses_server_resolved_phone_and_runtime_token():
    src = read(OUTBOUND)
    assert "META_PLATFORM_GRAPH_API_VERSION" in src
    assert "/${input.phoneNumberId}/messages" in src
    assert "Authorization: `Bearer ${input.accessToken}`" in src
    assert "recipient_type: 'individual'" in src
    assert "to: input.recipientWaId" in src
    assert "getPlatformWhatsAppSendCredentials" in src
    assert "tenantWhatsAppConnection.findFirst" in src
    assert "externalContactIdentity.externalUserId" in src


def test_send_credentials_do_not_load_admin_system_user_token():
    src = read(CREDENTIALS)
    send_fn = src[src.index("export async function getPlatformWhatsAppSendCredentials"):]
    assert "whatsappSystemUserAccessTokenEncrypted" in send_fn
    assert "whatsappAdminSystemUserAccessTokenEncrypted" not in send_fn
    assert "appSecretEncrypted" not in send_fn


def test_send_endpoint_accepts_only_text_and_idempotency_key():
    src = read(ROUTE)
    assert "withPermission('LEADS_CONTACT_WHATSAPP'" in src
    assert "text: z.string()" in src
    assert "idempotencyKey: z.string()" in src
    assert ").strict()" in src
    assert "phoneNumberId" not in src
    assert "wabaId" not in src
    assert "accessToken" not in src
    assert "recipientWaId" not in src
    assert "rateLimit({" in src


def test_agent_scope_is_enforced_again_in_service():
    src = read(OUTBOUND)
    assert "tenantUser.findFirst" in src
    assert "can(membership.role, 'LEADS_CONTACT_WHATSAPP')" in src
    assert "membership.role === 'agent'" in src
    assert "conversation.assignedTo === input.userId" in src
    assert "conversation.lead?.assignedTo === input.userId" in src


def test_webhook_reconciles_status_by_provider_message_id():
    src = read(RUNTIME)
    assert "metadata->>'providerMessageId' = ${input.externalMessageId}" in src
    assert "FOR UPDATE" in src
    assert "providerTimestamp: parseProviderTimestamp(status.timestamp)" in src
    assert "lastOutboundAt" in src
    assert "lastMessageAt" in src


def test_pr_has_no_schema_or_destructive_data_migration_dependency():
    src = read(OUTBOUND) + read(RUNTIME) + read(ROUTE)
    forbidden = ["TRUNCATE ", "DROP TABLE", "DELETE FROM public.leads", "UPDATE public.leads"]
    upper = src.upper()
    for token in forbidden:
        assert token not in upper
    assert DOC.exists()
