-- Several WhatsApp numbers in one company (official API, coexistence included).
-- Nothing is deleted or rewritten: two columns, new indexes, and two unique rules relaxed.
--  * A conversation records the number it came through. Conversations from before (empty number)
--    are taken by the first number that hears from the contact, so a company with one number sees
--    no change at all.
--  * One conversation per contact per number (the same customer on two numbers = two conversations).
--  * A WhatsApp Business account (WABA) may have several numbers: the number stays unique, the
--    account no longer.

ALTER TABLE "tenant_whatsapp_connections" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "whatsapp_connection_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_whatsapp_connection_id_fkey"
    FOREIGN KEY ("whatsapp_connection_id") REFERENCES "tenant_whatsapp_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "conversations_tenant_id_whatsapp_connection_id_idx"
  ON "conversations"("tenant_id", "whatsapp_connection_id");

-- New rule first, then the old one goes (the table is never without a uniqueness rule).
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_tenant_channel_identity_number_key"
  ON "conversations"("tenant_id", "provider", "channel", "external_contact_identity_id", COALESCE("whatsapp_connection_id", ''));
CREATE INDEX IF NOT EXISTS "conversation_tenant_channel_identity_idx"
  ON "conversations"("tenant_id", "provider", "channel", "external_contact_identity_id");
DROP INDEX IF EXISTS "conversation_tenant_channel_identity_key";

CREATE INDEX IF NOT EXISTS "tenant_whatsapp_connections_waba_id_idx"
  ON "tenant_whatsapp_connections"("waba_id");
DROP INDEX IF EXISTS "tenant_whatsapp_connections_waba_id_key";
