-- Flip AI Qualification Engine (PR 274)
-- Additive only. Apply manually through the controlled production runbook.
CREATE TABLE "flip_ai_qualifications" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "lead_id" TEXT,
  "knowledge_index_id" TEXT NOT NULL,
  "classification" TEXT NOT NULL,
  "fit_score" INTEGER NOT NULL,
  "intent_score" INTEGER NOT NULL,
  "awareness_level" INTEGER NOT NULL,
  "journey_stage" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "summary" TEXT NOT NULL,
  "reasons" TEXT[] NOT NULL,
  "next_action" TEXT NOT NULL,
  "evidence_message_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "model" TEXT NOT NULL,
  "qualified_lead_event_id" TEXT,
  "qualified_lead_tracking_status" TEXT NOT NULL DEFAULT 'not_applicable',
  "qualified_lead_dispatched_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "flip_ai_qualifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_ai_qualifications_scores_check" CHECK (
    "fit_score" BETWEEN 0 AND 100
    AND "intent_score" BETWEEN 0 AND 100
    AND "awareness_level" BETWEEN 1 AND 5
    AND "confidence" BETWEEN 0 AND 1
  ),
  CONSTRAINT "flip_ai_qualifications_classification_check" CHECK (
    "classification" IN ('qualified', 'nurture', 'disqualified', 'insufficient')
  ),
  CONSTRAINT "flip_ai_qualifications_journey_check" CHECK (
    "journey_stage" IN ('discovery', 'consideration', 'decision')
  ),
  CONSTRAINT "flip_ai_qualifications_tracking_status_check" CHECK (
    "qualified_lead_tracking_status" IN ('not_applicable', 'pending', 'processing', 'sent', 'skipped', 'ambiguous')
  ),
  CONSTRAINT "flip_ai_qualifications_merit_execution_check" CHECK (
    (
      "classification" = 'qualified'
      AND "qualified_lead_event_id" IS NOT NULL
      AND "qualified_lead_tracking_status" <> 'not_applicable'
    )
    OR
    (
      "classification" <> 'qualified'
      AND "qualified_lead_event_id" IS NULL
      AND "qualified_lead_tracking_status" = 'not_applicable'
    )
  )
);

CREATE UNIQUE INDEX "flip_ai_qualifications_conversation_id_key"
  ON "flip_ai_qualifications"("conversation_id");
CREATE UNIQUE INDEX "flip_ai_qualifications_qualified_lead_event_id_key"
  ON "flip_ai_qualifications"("qualified_lead_event_id");
CREATE UNIQUE INDEX "flip_ai_qualifications_tenant_id_id_key"
  ON "flip_ai_qualifications"("tenant_id", "id");
CREATE UNIQUE INDEX "flip_ai_qualifications_tenant_id_conversation_id_key"
  ON "flip_ai_qualifications"("tenant_id", "conversation_id");
CREATE INDEX "flip_ai_qualifications_tenant_id_agent_id_created_at_idx"
  ON "flip_ai_qualifications"("tenant_id", "agent_id", "created_at");
CREATE INDEX "flip_ai_qualifications_tenant_id_lead_id_created_at_idx"
  ON "flip_ai_qualifications"("tenant_id", "lead_id", "created_at");
CREATE INDEX "flip_ai_qualifications_tenant_id_classification_created_at_idx"
  ON "flip_ai_qualifications"("tenant_id", "classification", "created_at");
CREATE INDEX "flip_ai_qualifications_tenant_id_qualified_lead_tracking_status_idx"
  ON "flip_ai_qualifications"("tenant_id", "qualified_lead_tracking_status");

ALTER TABLE "flip_ai_qualifications"
  ADD CONSTRAINT "flip_ai_qualifications_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_ai_qualifications"
  ADD CONSTRAINT "flip_ai_qualifications_tenant_id_agent_id_fkey"
  FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "flip_ai_agents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_ai_qualifications"
  ADD CONSTRAINT "flip_ai_qualifications_tenant_id_conversation_id_fkey"
  FOREIGN KEY ("tenant_id", "conversation_id") REFERENCES "conversations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_ai_qualifications"
  ADD CONSTRAINT "flip_ai_qualifications_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "flip_ai_qualifications"
  ADD CONSTRAINT "flip_ai_qualifications_tenant_id_knowledge_index_id_fkey"
  FOREIGN KEY ("tenant_id", "knowledge_index_id") REFERENCES "flip_ai_knowledge_indexes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

