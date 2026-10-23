from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_resolving_pauses_the_ai_for_good():
    actions = read("lib/inbox/actions.ts")
    assert "aiPausedAt: now, aiPausedBy: input.session.userId, aiPauseReason: 'resolved' }" in actions
    pause = read("lib/whatsapp-ai/pause.ts")
    assert "'human_reply_phone', 'resolved'] as const;" in pause
    assert "if (conversation.aiPauseReason === 'resolved') return true;" in pause


def test_the_ai_reply_reads_the_pause_reason():
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "id: true, aiPausedAt: true, aiPauseReason: true," in reply
    assert "select: { aiPausedAt: true, aiPauseReason: true } });" in reply


def test_no_reactivation_for_resolved_or_paused_conversations():
    reactivation = read("lib/whatsapp-ai/reactivation.ts")
    assert "status: { not: 'resolved' }," in reactivation
    assert "if (isConversationAiPaused(conversation, number.resumeAfterHours, now)) continue;" in reactivation


def test_the_inbox_shows_the_resolved_pause():
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "if (conversation.aiPauseReason === 'resolved') return true;" in inbox
    assert "resolved: 'resolvida (atendimento humano)'," in inbox


def test_no_reactivation_for_not_qualified_or_clients():
    rules = read("lib/whatsapp-ai/reactivation-rules.ts")
    assert "if (isOutcomeStageName(candidate.leadStageName)) return false;" in rules
    assert "leadStageName: conversation.lead?.stage?.name ?? null," in read("lib/whatsapp-ai/reactivation.ts")
