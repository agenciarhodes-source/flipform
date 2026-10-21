from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_handing_back_to_the_ai_answers_the_pending_message():
    route = read("app/api/inbox/conversations/[id]/ai/route.ts")
    assert "z.enum(['pause', 'resume', 'answer'])" in route
    assert "pendingWhatsAppReply({ tenantId: session.tenantId, conversationId: conversation.id })" in route
    assert "if (!scheduleAfterResponse(work)) await work;" in route
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "export async function pendingWhatsAppReply(" in reply
    assert "trigger: 'handback'," in reply
    assert "23 * 3_600_000) return { status: 'window_closed' as const };" in reply


def test_only_a_person_handing_back_skips_the_hours_of_the_number():
    rules = read("lib/whatsapp-ai/eligibility.ts")
    assert rules.index("if (input.trigger === 'handback') return { answer: true };") > rules.index("reason: 'not_test_number'")
    assert rules.index("if (input.trigger === 'handback') return { answer: true };") < rules.index("reason: 'business_hours'")


def test_the_inbox_offers_an_answer_now_button_for_waiting_conversations():
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "Responder agora com a IA" in inbox
    assert "onChange('answer')" in inbox
    assert "aiChangeMessage(action, data.reply)" in inbox
