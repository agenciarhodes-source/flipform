-- Atendimento WhatsApp: whether the Flip AI answers on each connected number, with which agent and when.
-- Additive only: a new table, one row per number, starting switched off. No existing table changes.
CREATE TABLE IF NOT EXISTS "tenant_whatsapp_ai_settings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "agent_id" TEXT,
  "schedule_mode" TEXT NOT NULL DEFAULT 'always',
  "business_hours" JSONB,
  "no_reply_minutes" INTEGER NOT NULL DEFAULT 10,
  "daily_credit_limit" INTEGER,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_whatsapp_ai_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_whatsapp_ai_settings_connection_id_key" UNIQUE ("connection_id"),
  CONSTRAINT "tenant_whatsapp_ai_settings_schedule_mode_check" CHECK ("schedule_mode" IN ('always', 'outside_hours', 'no_reply')),
  CONSTRAINT "tenant_whatsapp_ai_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tenant_whatsapp_ai_settings_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tenant_whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tenant_whatsapp_ai_settings_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "flip_ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tenant_whatsapp_ai_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "tenant_whatsapp_ai_settings_tenant_id_idx" ON "tenant_whatsapp_ai_settings"("tenant_id");
