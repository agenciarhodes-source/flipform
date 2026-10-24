from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_the_lead_opens_with_name_and_number_and_ad_events_wait_for_qualification():
    lead = read("lib/whatsapp-ai/lead.ts")
    assert "if (!preferredName && !qualified && !engaged) return { kind: 'not_identified' as const };" in lead
    assert "const engaged = inbound >= 2;" in lead
    assert "captureStage: 'contact'" in lead
    assert "if (qualified && leadId && await conversionPending(input.tenantId, leadId)) {" in lead
    # The conversion is recorded before it is sent, so it never repeats.
    send = lead.split("async function sendWhatsAppLeadConversion", 1)[1]
    assert send.index("action: 'lead.whatsapp_ai_conversion_sent'") < send.index("await dispatchFormSubmissionTracking({")
    assert "channel: 'whatsapp'," in lead


def test_whatsapp_verdict_is_recorded_without_a_second_meta_event():
    q = read("lib/flip-ai/qualification.ts")
    assert "? Prisma.sql`AND c.provider = 'meta' AND c.channel = 'whatsapp'`" in q
    assert "const qualifiedLeadEventId = parsed.data.classification === 'qualified' && !whatsapp" in q
    assert "action: 'lead.whatsapp_ai_created'," in q


def test_the_ai_knows_the_name_and_never_asks_it_again():
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "NÃO pergunte o nome de novo." in reply
    assert "Nunca deixe essa pergunta para o fim da conversa." in reply
    assert ": nameConfirmed ? whatsappContactName(conversation.lead?.name) : nameInAnswer," in reply
    assert "preferredName: alignNameSpelling(plausibleName(parsed.identity?.name) || nameInAnswer, knownNames)," in reply
    assert "veja com perguntas se outro produto, serviço ou tese da empresa serve para ela" in reply
    # Handing the case to the team always comes with the verdict, which sends the ad conversion.
    assert "SEMPRE que você disser que vai encaminhar o caso para a equipe" in reply
