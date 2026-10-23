-- "Mensagem de reativação" for each WhatsApp number with the AI: off by default. Additive only.
ALTER TABLE "tenant_whatsapp_ai_settings" ADD COLUMN IF NOT EXISTS "reactivation_enabled" BOOLEAN NOT NULL DEFAULT false;
