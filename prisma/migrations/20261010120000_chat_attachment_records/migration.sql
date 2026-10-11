-- Records of photos and documents attached in the public chat.
-- The files themselves are kept in private object storage, not in this database.
-- Additive only: one new table, no existing table or data is changed.
CREATE TABLE "chat_attachments" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "client_message_id" TEXT,
  "object_key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "deleted_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_attachments_status_check" CHECK ("status" IN ('pending', 'ready', 'deleted')),
  CONSTRAINT "chat_attachments_size_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 5242880)
);

CREATE UNIQUE INDEX "chat_attachments_object_key_key" ON "chat_attachments"("object_key");
CREATE INDEX "chat_attachments_tenant_id_conversation_id_status_idx"
  ON "chat_attachments"("tenant_id", "conversation_id", "status");
CREATE INDEX "chat_attachments_status_expires_at_idx" ON "chat_attachments"("status", "expires_at");
