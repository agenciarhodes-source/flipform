-- WhatsApp answers in voice. Additive only: one new table, off for every company.
CREATE TABLE IF NOT EXISTS "whatsapp_voice_settings" (
  "tenant_id" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'off',
  "provider" TEXT NOT NULL DEFAULT 'elevenlabs',
  "voice_id" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_voice_settings_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "whatsapp_voice_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "whatsapp_voice_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
