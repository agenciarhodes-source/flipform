-- Welcome on WhatsApp: the wait in seconds (for example 90 = 1 min 30 s). Additive only: one new column, empty
-- means the old minutes setting.
ALTER TABLE "whatsapp_welcome_settings" ADD COLUMN IF NOT EXISTS "delay_seconds" INTEGER;
