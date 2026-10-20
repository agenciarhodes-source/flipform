-- The Flip's suggestions (follow-up task, lead transfer, rebalance) and what was decided.
-- Additive only: one new table.
CREATE TABLE IF NOT EXISTS "flip_suggestions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "subject_key" TEXT NOT NULL,
  "lead_id" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "decided_by" TEXT,
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flip_suggestions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_suggestions_kind_check" CHECK ("kind" IN ('create_task', 'transfer_lead', 'rebalance')),
  CONSTRAINT "flip_suggestions_status_check" CHECK ("status" IN ('pending', 'applied', 'dismissed', 'expired')),
  CONSTRAINT "flip_suggestions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "flip_suggestions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "flip_suggestions_tenant_id_status_idx" ON "flip_suggestions"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "flip_suggestions_tenant_id_subject_key_created_at_idx" ON "flip_suggestions"("tenant_id", "subject_key", "created_at");
