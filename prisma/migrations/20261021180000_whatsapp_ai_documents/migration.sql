-- Documents checked by the Flip AI on WhatsApp: lists per company, the check of each file
-- (only the result; files stay at Meta) and the type of case of each conversation.
-- Additive only: three new tables.
CREATE TABLE IF NOT EXISTS "document_checklists" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "items" JSONB NOT NULL DEFAULT '[]',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_checklists_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_checklists_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "lead_documents" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "lead_id" TEXT,
  "message_id" TEXT NOT NULL,
  "checklist_id" TEXT,
  "item_key" TEXT,
  "detected_type" TEXT,
  "status" TEXT NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_documents_message_id_key" UNIQUE ("message_id"),
  CONSTRAINT "lead_documents_status_check" CHECK ("status" IN ('received', 'unreadable', 'problem', 'unrecognized')),
  CONSTRAINT "lead_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lead_documents_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lead_documents_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "lead_documents_tenant_id_conversation_id_idx" ON "lead_documents"("tenant_id", "conversation_id");
CREATE TABLE IF NOT EXISTS "conversation_document_cases" (
  "conversation_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "checklist_id" TEXT NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_document_cases_pkey" PRIMARY KEY ("conversation_id"),
  CONSTRAINT "conversation_document_cases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_document_cases_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "conversation_document_cases_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "document_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
