-- What the human attendance did well, proposed for the Markdown Mestre. Nothing changes until an
-- owner approves. Additive only: one new table.
CREATE TABLE IF NOT EXISTS "attendance_learning_suggestions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "example" TEXT,
  "conversation_count" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "decided_by" TEXT,
  "decided_at" TIMESTAMP(3),
  "applied_revision" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_learning_suggestions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_learning_suggestions_kind_check" CHECK ("kind" IN ('phrase', 'objection', 'triage', 'explanation', 'closing', 'other')),
  CONSTRAINT "attendance_learning_suggestions_status_check" CHECK ("status" IN ('pending', 'approved', 'dismissed')),
  CONSTRAINT "attendance_learning_suggestions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "attendance_learning_suggestions_tenant_id_status_created_at_idx" ON "attendance_learning_suggestions"("tenant_id", "status", "created_at");
