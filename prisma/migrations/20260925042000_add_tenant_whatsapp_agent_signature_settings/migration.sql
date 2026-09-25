CREATE TABLE IF NOT EXISTS "tenant_whatsapp_settings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "agent_signature_mode" TEXT NOT NULL DEFAULT 'disabled',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_whatsapp_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_whatsapp_settings_tenant_id_key"
  ON "tenant_whatsapp_settings"("tenant_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_whatsapp_settings_tenant_id_fkey'
  ) THEN
    ALTER TABLE "tenant_whatsapp_settings"
      ADD CONSTRAINT "tenant_whatsapp_settings_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
