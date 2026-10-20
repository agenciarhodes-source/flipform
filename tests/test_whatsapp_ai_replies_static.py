from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_the_ai_answers_only_when_every_check_passes():
    reply = read("lib/whatsapp-ai/reply.ts")
    for check in (
        "if (!latestInbound || latestInbound.id !== input.inboundMessageId) return { replied: false, reason: 'newer_message' };",
        "if (outboundAt && outboundAt >= inboundAt) return { replied: false, reason: 'already_answered' };",
        "if (!decision.answer) return { replied: false, reason: decision.reason };",
        "if (isConversationAiPaused(conversation, settings.resumeAfterHours, now)) return { replied: false, reason: 'paused' };",
        "return { replied: false, reason: 'daily_limit' };",
        "return { replied: false, reason: 'team_answered_meanwhile' };",
    ):
        assert check in reply
    # A3 only talks: no lead, no conversion event.
    for forbidden in ("captureFlipAiLead", "finalizeFlipAiQualification", "processWhatsAppFunnelMessage"):
        assert forbidden not in reply


def test_ai_replies_are_sent_as_the_ai_and_stored_once():
    outbound = read("lib/meta/whatsapp-outbound.ts")
    assert "sentByUserId: aiSender || systemSender ? null : requestedByUserId," in outbound
    assert "...(aiSender ? { aiAgentId: aiSender.agentId, aiAgentName: aiSender.agentName } : {})," in outbound
    chat = read("lib/flip-ai/public-chat.ts")
    assert "if (options.recordOutbound !== false) await recordOutboundMessage({" in chat
    assert "{ recordOutbound: false }," in read("lib/whatsapp-ai/reply.ts")


def test_test_numbers_first_and_release_switch():
    migration = read("prisma/migrations/20261020180000_whatsapp_ai_test_numbers/migration.sql")
    assert migration.count("ADD COLUMN IF NOT EXISTS") == 2 and "DROP" not in migration
    ui = read("components/whatsapp-ai/settings-manager.tsx")
    assert "Liberar a IA para todos os clientes deste número" in ui
    webhook = read("app/api/webhooks/meta/whatsapp/route.ts")
    assert "replyAfterQuietPeriod(candidate)" in webhook
    assert "isCronRequestAuthorized(req)" in read("app/api/internal/jobs/whatsapp-ai/route.ts")

def test_team_answered_check_ignores_the_answer_that_was_already_there():
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "createdAt: { gt: latestOutbound?.createdAt || new Date(0) }," in reply
    assert "...(latestOutbound ? { id: { not: latestOutbound.id } } : {})," in reply
