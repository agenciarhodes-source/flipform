-- "Sequência de retomada" on WhatsApp. Additive only: two new tables, nothing existing changes.
-- Starts switched off for every company.
CREATE TABLE IF NOT EXISTS "whatsapp_followup_settings" (
  "tenant_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "steps" JSONB NOT NULL DEFAULT '[]',
  "call_after_step" INTEGER NOT NULL DEFAULT 2,
  "enabled_at" TIMESTAMP(3),
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_followup_settings_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "whatsapp_followup_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "whatsapp_followup_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "whatsapp_followup_sends" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "cycle_at" TIMESTAMP(3) NOT NULL,
  "step" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT,
  "message_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_followup_sends_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_followup_sends_cycle_key" UNIQUE ("conversation_id", "cycle_at", "step"),
  CONSTRAINT "whatsapp_followup_sends_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "whatsapp_followup_sends_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "whatsapp_followup_sends_tenant_id_created_at_idx" ON "whatsapp_followup_sends"("tenant_id", "created_at");
