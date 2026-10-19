-- Human and AI never answer the same WhatsApp conversation at once.
-- Additive only: empty columns; every existing conversation starts as not paused.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "ai_paused_at" TIMESTAMP(3);
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "ai_paused_by" TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "ai_pause_reason" TEXT;
-- Hours after which a paused conversation goes back to the AI; empty = only when someone hands it back.
ALTER TABLE "tenant_whatsapp_ai_settings" ADD COLUMN IF NOT EXISTS "resume_after_hours" INTEGER;
