from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_a_pilot_conversation_becomes_a_lead_with_name_and_ad_events_go_once_at_qualification():
    lead = read("lib/whatsapp-ai/lead.ts")
    assert "if (!isWhatsAppAiLeadTenant(input.tenantId)) return { kind: 'pilot_off' as const };" in lead
    # C1: name + WhatsApp number open the lead; a qualified conversation also opens it.
    assert "if (!preferredName && !qualified && !engaged) return { kind: 'not_identified' as const };" in lead
    assert "if (!('leadId' in outcome)) return { kind: outcome.kind };" in lead
    assert "metaLeadEventId: `whatsapp-ai-lead:${input.conversationId}`," in lead
    assert "enqueueGoogleConversionEvents({" in lead
    # The preferred name only replaces the WhatsApp profile name, never what the team wrote.
    assert "where: { id: leadId, tenantId: input.tenantId, name: profileName }," in lead


def test_meta_gets_the_ad_click_of_click_to_whatsapp_conversations():
    tracking = read("lib/tracking.ts")
    assert "? (context.metaAttribution?.ctwaClid ? 'business_messaging' : 'system_generated')" in tracking
    capi = read("lib/tracking/meta-capi.ts")
    assert "addPlain(data, 'ctwa_clid', user?.ctwaClid);" in capi
    assert "messaging_channel: payload.actionSource === 'business_messaging'" in capi
    runtime = read("lib/meta/whatsapp-runtime.ts")
    assert "adReferral: { equals: Prisma.DbNull } }," in runtime
    migration = read("prisma/migrations/20261021120000_conversation_ad_referral/migration.sql")
    assert "ADD COLUMN IF NOT EXISTS" in migration and "DROP" not in migration
