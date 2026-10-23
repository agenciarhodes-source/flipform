from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_new_whatsapp_messages_link_the_registered_lead():
    runtime = read("lib/meta/whatsapp-runtime.ts")
    assert "if (!persisted.conversation.leadId) {" in runtime
    assert "await autoLinkWhatsAppConversation({" in runtime


def test_auto_link_fills_the_owner_and_is_recorded():
    linking = read("lib/conversations/whatsapp-lead-linking.ts")
    assert "export async function autoLinkWhatsAppConversation(" in linking
    assert "assignLeadByRotation({ tenantId, formId: lead.formId, tx })" in linking
    assert "source: 'auto_phone_match'" in linking
    route = read("app/api/inbox/conversations/[id]/match-lead/route.ts")
    assert "autoLinkWhatsAppConversation({" in route


def test_the_ai_uses_the_registration():
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "await leadRegistration(input.tenantId, conversation.leadId)" in reply
    assert "registrationNote: registration?.fromForm" in reply
    assert "...(input.firstReply && input.registrationNote ? [input.registrationNote] : [])," in reply
    lead = read("lib/whatsapp-ai/lead.ts")
    assert "export async function leadRegistration(tenantId: string, leadId: string)" in lead
    assert lead.count("metadata: { agentId: input.runtime.id, preferredName },") == 2
