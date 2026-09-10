-- Additive PR #272. Review and apply manually on an isolated Neon branch first.
-- Never run prisma migrate deploy against production.
CREATE UNIQUE INDEX "conversations_tenant_id_id_key"
  ON "conversations"("tenant_id", "id");

CREATE TABLE "flip_ai_conversation_states" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "turn_count" INTEGER NOT NULL DEFAULT 0,
  "summary" TEXT,
  "summary_updated_at" TIMESTAMP(3),
  "last_response_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "flip_ai_conversation_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_ai_conversation_states_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_conversation_states_tenant_id_agent_id_fkey"
    FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "flip_ai_agents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_conversation_states_tenant_id_conversation_id_fkey"
    FOREIGN KEY ("tenant_id", "conversation_id") REFERENCES "conversations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "flip_ai_conversation_states_conversation_id_key"
  ON "flip_ai_conversation_states"("conversation_id");
CREATE UNIQUE INDEX "flip_ai_conversation_states_tenant_id_id_key"
  ON "flip_ai_conversation_states"("tenant_id", "id");
CREATE UNIQUE INDEX "flip_ai_conversation_states_tenant_id_conversation_id_key"
  ON "flip_ai_conversation_states"("tenant_id", "conversation_id");
CREATE INDEX "flip_ai_conversation_states_tenant_id_agent_id_status_idx"
  ON "flip_ai_conversation_states"("tenant_id", "agent_id", "status");

ALTER TABLE "flip_ai_usage_events"
  ADD COLUMN "conversation_id" TEXT;

ALTER TABLE "flip_ai_usage_events"
  ADD CONSTRAINT "flip_ai_usage_events_tenant_id_conversation_id_fkey"
  FOREIGN KEY ("tenant_id", "conversation_id") REFERENCES "conversations"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "flip_ai_usage_events_tenant_id_conversation_id_created_at_idx"
  ON "flip_ai_usage_events"("tenant_id", "conversation_id", "created_at");
