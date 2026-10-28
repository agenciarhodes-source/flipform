-- Atendimento Instagram: whether the Flip AI answers the Direct of each connected Instagram account,
-- with which agent. Additive only: a new table, one row per account, starting switched off.
-- No existing table changes; the Instagram connection itself is not touched.
CREATE TABLE IF NOT EXISTS "tenant_instagram_ai_settings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "agent_id" TEXT,
  "live_enabled" BOOLEAN NOT NULL DEFAULT false,
  "test_usernames" TEXT[] NOT NULL DEFAULT '{}',
  "daily_credit_limit" INTEGER,
  "resume_after_hours" INTEGER,
  "introduction" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_instagram_ai_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_instagram_ai_settings_connection_id_key" UNIQUE ("connection_id"),
  CONSTRAINT "tenant_instagram_ai_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tenant_instagram_ai_settings_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tenant_instagram_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tenant_instagram_ai_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "tenant_instagram_ai_settings_tenant_id_idx" ON "tenant_instagram_ai_settings"("tenant_id");
