from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_only_a_qualified_conversation_of_a_pilot_company_becomes_a_lead_once():
    lead = read("lib/whatsapp-ai/lead.ts")
    assert "if (!isWhatsAppAiLeadTenant(input.tenantId)) return { kind: 'pilot_off' as const };" in lead
    assert "if (input.classification !== 'qualified') return { kind: 'not_qualified' as const };" in lead
    assert "if (outcome.kind !== 'created') return { kind: outcome.kind };" in lead
    assert "metaLeadEventId: `whatsapp-ai-lead:${input.conversationId}`," in lead
    assert "enqueueGoogleConversionEvents({" in lead
    # The preferred name only replaces the WhatsApp profile name, never what the team wrote.
    assert "where: { id: conversation.leadId, tenantId: input.tenantId, name: profileName }," in lead


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
