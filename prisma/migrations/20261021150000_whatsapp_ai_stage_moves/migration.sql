-- The Flip AI moving leads through the funnel: criteria per stage, suggestions, and the mode per number.
-- Additive only: two new tables and one column that starts as 'suggest'.
CREATE TABLE IF NOT EXISTS "pipeline_stage_ai_rules" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "stage_id" TEXT NOT NULL,
  "criterion" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pipeline_stage_ai_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pipeline_stage_ai_rules_stage_id_key" UNIQUE ("stage_id"),
  CONSTRAINT "pipeline_stage_ai_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pipeline_stage_ai_rules_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "lead_stage_suggestions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "from_stage_id" TEXT,
  "to_stage_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "decided_by" TEXT,
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_stage_suggestions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_stage_suggestions_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'auto_applied', 'expired')),
  CONSTRAINT "lead_stage_suggestions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lead_stage_suggestions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lead_stage_suggestions_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "pipeline_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "lead_stage_suggestions_tenant_id_status_idx" ON "lead_stage_suggestions"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "lead_stage_suggestions_lead_id_status_idx" ON "lead_stage_suggestions"("lead_id", "status");
ALTER TABLE "tenant_whatsapp_ai_settings" ADD COLUMN IF NOT EXISTS "stage_mode" TEXT NOT NULL DEFAULT 'suggest';
