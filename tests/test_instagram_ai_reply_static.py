from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


REPLY = read("lib/instagram-ai/reply.ts")


def test_the_ai_answers_only_when_every_safeguard_allows():
    for guard in [
        "provider: 'meta', channel: 'instagram'",
        "latestInbound.id !== input.inboundMessageId) return { replied: false, reason: 'newer_message' }",
        "if (outboundAt && outboundAt >= inboundAt) return { replied: false, reason: 'already_answered' }",
        "INSTAGRAM_AI_WINDOW_HOURS * 3_600_000) return { replied: false, reason: 'window_closed' }",
        "automationMatched === true) return { replied: false, reason: 'automation' }",
        "if (!connection || !settings || !settings.enabled || !settings.agentId) return { replied: false, reason: 'not_configured' }",
        "if (isConversationAiPaused(conversation, settings.resumeAfterHours, now)) return { replied: false, reason: 'paused' }",
        "if (!allowed.answer) return { replied: false, reason: allowed.reason }",
        "return { replied: false, reason: 'daily_limit' }",
        "if (!runtime || runtime.tenantId !== input.tenantId) return { replied: false, reason: 'agent_unavailable' }",
        "reason: 'duplicate_run'",
        "reason: 'team_answered_meanwhile'",
    ]:
        assert guard in REPLY, guard
    # The order matters: nothing is spent before the checks.
    assert REPLY.index("reason: 'daily_limit'") < REPLY.index("prisma.flipAiUsageEvent.create(")


def test_it_sends_as_the_ai_in_the_same_conversation_once_per_message():
    assert "aiSender: { agentId: runtime.id, agentName: runtime.name }" in REPLY
    assert "requestKey = `instagram:${input.tenantId}:${conversation.id}:${latestInbound.id}`" in REPLY
    assert "instagramConnectionId: connection.id" in REPLY
    assert "{ recordOutbound: false }" in REPLY


def test_webhook_triggers_the_ai_only_for_new_messages_without_a_keyword_automation():
    runtime = read("lib/meta/instagram-webhook-runtime.ts")
    assert "automationMatched: true" in runtime
    block = runtime.split("if (persisted.duplicate) result.duplicates += 1;")[1].split("} else {\n      result.ignored")[0]
    assert "} else {\n            result.aiCandidates.push(" in block.replace("\r\n", "\n")
    route = read("app/api/webhooks/meta/instagram/route.ts")
    assert "replyToInstagramAfterQuietPeriod(candidate)" in route
    assert "if (!scheduleAfterResponse(work)) await work;" in route
    # The signature check still comes first.
    assert route.index("verifyInstagramWebhookSignature(") < route.index("processInstagramWebhook(payload)")


def test_safety_net_and_hand_back():
    job = read("app/api/internal/jobs/whatsapp-ai/route.ts")
    assert "sweepUnansweredInstagramConversations()" in job
    inbox = read("app/api/inbox/conversations/[id]/ai/route.ts")
    assert "pendingInstagramReply({ tenantId: session.tenantId, conversationId: conversation.id })" in inbox


def test_the_sender_profile_is_read_with_the_account_token_and_kept_only_on_the_contact():
    profile = read("lib/instagram-ai/profile.ts")
    assert "Authorization: `Bearer ${input.accessToken}`" in profile
    assert "access_token=" not in profile
    assert "where: { id: input.identity.id, tenantId: input.tenantId }" in profile
