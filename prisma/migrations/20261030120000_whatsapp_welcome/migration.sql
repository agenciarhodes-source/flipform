-- Welcome message on WhatsApp for people who sent a form and did not write: settings per company
-- and one row per lead (the lock that makes it go once). Additive only: two new tables, off by default.
CREATE TABLE IF NOT EXISTS "whatsapp_welcome_settings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "template" TEXT,
  "delay_minutes" INTEGER NOT NULL DEFAULT 2,
  "enabled_at" TIMESTAMP(3),
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_welcome_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_welcome_settings_tenant_id_key" UNIQUE ("tenant_id"),
  CONSTRAINT "whatsapp_welcome_settings_delay_check" CHECK ("delay_minutes" BETWEEN 1 AND 60),
  CONSTRAINT "whatsapp_welcome_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "whatsapp_welcome_sends" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "message_id" TEXT,
  "status" TEXT NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_welcome_sends_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_welcome_sends_lead_id_key" UNIQUE ("lead_id"),
  CONSTRAINT "whatsapp_welcome_sends_status_check" CHECK ("status" IN ('pending', 'sent', 'failed', 'skipped')),
  CONSTRAINT "whatsapp_welcome_sends_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "whatsapp_welcome_sends_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "whatsapp_welcome_sends_tenant_id_created_at_idx" ON "whatsapp_welcome_sends"("tenant_id", "created_at");
