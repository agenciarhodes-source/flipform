-- Temporary storage of photos and documents attached in the public chat.
-- Additive only: one new table, no existing table or data is changed.
-- Rows expire after a few days and are deleted by the application.
-- Until it is applied, attachments are still read by the attendant but are not kept.
CREATE TABLE "chat_attachments" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "client_message_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_attachments_size_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 4194304)
);

CREATE UNIQUE INDEX "chat_attachments_conversation_id_client_message_id_key"
  ON "chat_attachments"("conversation_id", "client_message_id");
CREATE INDEX "chat_attachments_tenant_id_conversation_id_idx"
  ON "chat_attachments"("tenant_id", "conversation_id");
CREATE INDEX "chat_attachments_expires_at_idx" ON "chat_attachments"("expires_at");
