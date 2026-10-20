-- Supervision of the AI on WhatsApp: the Flip's review of each conversation. Additive only: one new table.
CREATE TABLE IF NOT EXISTS "flip_ai_conversation_reviews" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "last_message_id" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "issues" JSONB NOT NULL DEFAULT '[]',
  "summary" TEXT NOT NULL,
  "suggestion" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "resolved_by" TEXT,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flip_ai_conversation_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_ai_conversation_reviews_conversation_id_last_message_id_key" UNIQUE ("conversation_id", "last_message_id"),
  CONSTRAINT "flip_ai_conversation_reviews_score_check" CHECK ("score" BETWEEN 1 AND 5),
  CONSTRAINT "flip_ai_conversation_reviews_status_check" CHECK ("status" IN ('new', 'resolved')),
  CONSTRAINT "flip_ai_conversation_reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_conversation_reviews_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "flip_ai_conversation_reviews_tenant_id_status_score_idx" ON "flip_ai_conversation_reviews"("tenant_id", "status", "score");
