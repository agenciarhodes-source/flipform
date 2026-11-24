-- Flip Voice PR3: additive WhatsApp Business Calling controls; ALL flags OFF.
-- Must be rehearsed against a DISPOSABLE PostgreSQL database before any deploy.
ALTER TABLE "flip_voice_lines"
  ADD COLUMN "whatsapp_inbound_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "whatsapp_outbound_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "whatsapp_sender_sid" TEXT,
  ADD COLUMN "whatsapp_routing_mode" TEXT NOT NULL DEFAULT 'none';

ALTER TABLE "flip_voice_contact_permissions"
  ADD COLUMN "provider_permission_source" TEXT,
  ADD COLUMN "provider_permission_ref" TEXT,
  ADD COLUMN "provider_permission_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "outbound_call_window_start" TIMESTAMP(3),
  ADD COLUMN "outbound_calls_in_window" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "flip_voice_lines"
  ADD CONSTRAINT "flip_voice_lines_whatsapp_routing_mode_check"
  CHECK ("whatsapp_routing_mode" IN ('none','twilio_voice'));

ALTER TABLE "flip_voice_contact_permissions"
  ADD CONSTRAINT "flip_voice_contact_permissions_outbound_calls_nonnegative_check"
  CHECK ("outbound_calls_in_window" >= 0);

CREATE UNIQUE INDEX "flip_voice_lines_whatsapp_sender_sid_key"
  ON "flip_voice_lines" ("whatsapp_sender_sid");
CREATE INDEX "flip_voice_contact_permissions_tenant_id_channel_phone_hash_idx"
  ON "flip_voice_contact_permissions" ("tenant_id","channel","phone_hash");
