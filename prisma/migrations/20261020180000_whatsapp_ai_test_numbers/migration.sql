-- The AI first answers only test numbers; a separate switch releases it to every customer.
-- Additive only: empty list and switch off.
ALTER TABLE "tenant_whatsapp_ai_settings" ADD COLUMN IF NOT EXISTS "test_phone_numbers" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "tenant_whatsapp_ai_settings" ADD COLUMN IF NOT EXISTS "live_enabled" BOOLEAN NOT NULL DEFAULT false;
