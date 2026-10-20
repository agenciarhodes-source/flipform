-- How the WhatsApp AI introduces itself. Additive only: empty keeps the default text.
ALTER TABLE "tenant_whatsapp_ai_settings" ADD COLUMN IF NOT EXISTS "introduction" TEXT;
