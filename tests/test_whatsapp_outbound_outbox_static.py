from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTBOUND = ROOT / "lib/meta/whatsapp-outbound.ts"
RUNTIME = ROOT / "lib/meta/whatsapp-runtime.ts"
SEND_CREDENTIALS = ROOT / "lib/meta/whatsapp-send-credentials.ts"
WEBHOOK_CREDENTIALS = ROOT / "lib/meta/whatsapp-runtime-credentials.ts"
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
    assert src.count("await sendMetaWhatsAppText({") == 1


def test_provider_acceptance_and_buffer_reconciliation_precede_finalization():
    src = read(OUTBOUND)
    acceptance_pos = src.index("await persistProviderAcceptance({")
    reconcile_pos = src.index("await reconcileBufferedWhatsAppStatusesForMessage({", acceptance_pos)
    finalize_pos = src.index("await finalizeAcceptedMessage({", reconcile_pos)
    assert acceptance_pos < reconcile_pos < finalize_pos
    assert "providerMessageId" in src
    assert "dispatchState: 'accepted'" in src


def test_finalize_uses_acceptance_time_for_conversation_activity():
    src = read(OUTBOUND)
    segment = src[src.index("async function finalizeAcceptedMessage"):src.index("async function sendMetaWhatsAppText")]
    assert "providerAcceptedAt" in src
    assert "const activityAt = parseAcceptedAt(metadata)" in segment
    assert "lastOutboundAt" in segment
    assert "lastMessageAt" in segment
    assert "providerTimestamp: activityAt" in segment


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


def test_send_credentials_are_strictly_isolated_from_webhook_credentials():
    send_src = read(SEND_CREDENTIALS)
    webhook_src = read(WEBHOOK_CREDENTIALS)
    assert "whatsappSystemUserAccessTokenEncrypted" in send_src
    assert "whatsappAdminSystemUserAccessTokenEncrypted" not in send_src
    assert "appSecretEncrypted" not in send_src
    assert "whatsappSystemUserAccessTokenEncrypted" not in webhook_src
    assert "whatsappAdminSystemUserAccessTokenEncrypted" not in webhook_src
    assert "whatsapp-send-credentials" not in webhook_src


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


def test_delivery_receipts_do_not_change_conversation_activity_order():
    src = read(RUNTIME)
    segment = src[src.index("export async function applyWhatsAppMessageStatus"):src.index("function bufferedStatusEventId")]
    assert "metadata->>'providerMessageId' = ${input.externalMessageId}" in segment
    assert "FOR UPDATE" in segment
    assert "lastOutboundAt" not in segment
    assert "lastMessageAt" not in segment


def test_unmatched_provider_statuses_are_buffered_and_reconciled():
    src = read(RUNTIME)
    assert "STATUS_BUFFER_PROVIDER" in src
    assert "prisma.webhookEvent.upsert" in src
    assert "provider_eventId" in src
    assert "processedAt: null" in src
    assert "raw_payload->>'externalMessageId' = ${input.providerMessageId}" in src
    assert "export async function reconcileBufferedWhatsAppStatusesForMessage" in src
    assert "applied.reason === 'message_not_found'" in src
    assert "bufferUnmatchedWhatsAppStatus" in src
    assert "markBufferedStatusProcessed" in src


def test_post_send_tracking_is_best_effort():
    src = read(OUTBOUND)
    segment = src[src.index("async function runTrackingAfterSend"):src.index("export async function enqueueAndDispatchWhatsAppTextMessage")]
    assert "try {" in segment
    assert "await processWhatsAppFunnelMessage" in segment
    assert "catch (error)" in segment
    assert "WhatsApp post-send tracking failed" in segment


def test_pr_has_no_schema_or_destructive_data_migration_dependency():
    src = read(OUTBOUND) + read(RUNTIME) + read(ROUTE)
    forbidden = ["TRUNCATE ", "DROP TABLE", "DELETE FROM PUBLIC.LEADS", "UPDATE PUBLIC.LEADS"]
    upper = src.upper()
    for token in forbidden:
        assert token not in upper
    assert DOC.exists()
