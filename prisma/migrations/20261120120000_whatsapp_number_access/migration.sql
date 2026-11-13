-- Who sees which WhatsApp number of the company (Inbox). Additive only: one new table.
-- A person with no row sees every number, as before; a person with rows sees only those numbers.
CREATE TABLE IF NOT EXISTS "whatsapp_number_access" (
  "tenant_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_number_access_pkey" PRIMARY KEY ("connection_id", "user_id"),
  CONSTRAINT "whatsapp_number_access_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "whatsapp_number_access_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "tenant_whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "whatsapp_number_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "whatsapp_number_access_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "whatsapp_number_access_tenant_id_user_id_idx" ON "whatsapp_number_access"("tenant_id", "user_id");
