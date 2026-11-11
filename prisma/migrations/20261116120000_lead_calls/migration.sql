-- Calls the team made to a lead and how they went. Additive only: one new table.
CREATE TABLE IF NOT EXISTS "lead_calls" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "user_id" TEXT,
  "outcome" TEXT NOT NULL,
  "note" TEXT,
  "callback_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_calls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_calls_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lead_calls_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lead_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "lead_calls_tenant_id_lead_id_created_at_idx" ON "lead_calls"("tenant_id", "lead_id", "created_at");
