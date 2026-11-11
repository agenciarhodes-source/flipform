-- Corrections of messages the team sent on WhatsApp (history of versions). Additive only: one new table.
CREATE TABLE IF NOT EXISTS "message_edits" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "correction_message_id" TEXT,
  "previous_text" TEXT NOT NULL,
  "new_text" TEXT NOT NULL,
  "edited_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_edits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_edits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "message_edits_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "message_edits_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "message_edits_tenant_id_message_id_created_at_idx" ON "message_edits"("tenant_id", "message_id", "created_at");
