-- Attendants chosen in Integrações who also see the WhatsApp conversations nobody has yet.
-- Additive only: one column that starts empty, so nobody sees anything new until chosen.
ALTER TABLE "tenant_whatsapp_settings" ADD COLUMN IF NOT EXISTS "unassigned_viewer_user_ids" TEXT[] NOT NULL DEFAULT '{}';
