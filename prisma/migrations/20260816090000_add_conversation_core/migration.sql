-- Conversation Core: additive-only foundation for WhatsApp and Instagram messaging.
-- Existing customer records remain untouched; this migration only creates new messaging structures.

CREATE TABLE "external_contact_identities" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'meta',
  "channel" TEXT NOT NULL,
  "external_user_id" TEXT NOT NULL,
  "username" TEXT,
  "display_name" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "lead_id" TEXT,
  "metadata" JSONB,
  "last_seen_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_contact_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'meta',
  "channel" TEXT NOT NULL,
  "external_contact_identity_id" TEXT NOT NULL,
  "lead_id" TEXT,
  "assigned_to" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_message_at" TIMESTAMP(3),
  "last_inbound_at" TIMESTAMP(3),
  "last_outbound_at" TIMESTAMP(3),
  "unread_count" INTEGER NOT NULL DEFAULT 0,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'meta',
  "channel" TEXT NOT NULL,
  "external_message_id" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'text',
  "text" TEXT,
  "status" TEXT NOT NULL DEFAULT 'received',
  "sender_external_id" TEXT,
  "sent_by_user_id" TEXT,
  "reply_to_message_id" TEXT,
  "provider_timestamp" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_contact_identity_tenant_channel_user_key"
  ON "external_contact_identities"("tenant_id", "provider", "channel", "external_user_id");
CREATE INDEX "external_contact_identities_tenant_id_channel_idx"
  ON "external_contact_identities"("tenant_id", "channel");
CREATE INDEX "external_contact_identities_lead_id_idx"
  ON "external_contact_identities"("lead_id");
CREATE INDEX "external_contact_identities_tenant_id_last_seen_at_idx"
  ON "external_contact_identities"("tenant_id", "last_seen_at");

CREATE UNIQUE INDEX "conversation_tenant_channel_identity_key"
  ON "conversations"("tenant_id", "provider", "channel", "external_contact_identity_id");
CREATE INDEX "conversations_tenant_id_status_last_message_at_idx"
  ON "conversations"("tenant_id", "status", "last_message_at");
CREATE INDEX "conversations_tenant_id_assigned_to_idx"
  ON "conversations"("tenant_id", "assigned_to");
CREATE INDEX "conversations_tenant_id_channel_last_message_at_idx"
  ON "conversations"("tenant_id", "channel", "last_message_at");
CREATE INDEX "conversations_lead_id_idx" ON "conversations"("lead_id");
CREATE INDEX "conversations_external_contact_identity_id_idx"
  ON "conversations"("external_contact_identity_id");

CREATE UNIQUE INDEX "message_tenant_channel_external_id_key"
  ON "messages"("tenant_id", "provider", "channel", "external_message_id");
CREATE INDEX "messages_conversation_id_provider_timestamp_idx"
  ON "messages"("conversation_id", "provider_timestamp");
CREATE INDEX "messages_tenant_id_created_at_idx"
  ON "messages"("tenant_id", "created_at");
CREATE INDEX "messages_tenant_id_channel_status_idx"
  ON "messages"("tenant_id", "channel", "status");

ALTER TABLE "external_contact_identities"
  ADD CONSTRAINT "external_contact_identities_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_contact_identities"
  ADD CONSTRAINT "external_contact_identities_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_external_contact_identity_id_fkey"
  FOREIGN KEY ("external_contact_identity_id") REFERENCES "external_contact_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_assigned_to_fkey"
  FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages"
  ADD CONSTRAINT "messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages"
  ADD CONSTRAINT "messages_sent_by_user_id_fkey"
  FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "messages"
  ADD CONSTRAINT "messages_reply_to_message_id_fkey"
  FOREIGN KEY ("reply_to_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
