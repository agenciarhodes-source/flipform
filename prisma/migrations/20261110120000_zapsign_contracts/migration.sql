-- Contracts by ZapSign (electronic signature). Additive only: three new tables, nothing existing
-- changes. Starts switched off for every company; the Super Admin releases it per company.
CREATE TABLE IF NOT EXISTS "tenant_zapsign_settings" (
  "tenant_id" TEXT NOT NULL,
  "allowed" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "api_token_encrypted" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_zapsign_settings_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "tenant_zapsign_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tenant_zapsign_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "zapsign_templates" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "checklist_id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "zapsign_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "zapsign_templates_checklist_id_key" UNIQUE ("checklist_id"),
  CONSTRAINT "zapsign_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "zapsign_templates_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "document_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "zapsign_templates_tenant_id_idx" ON "zapsign_templates"("tenant_id");

CREATE TABLE IF NOT EXISTS "lead_contracts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "lead_id" TEXT,
  "checklist_id" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'zapsign',
  "provider_doc_token" TEXT,
  "sign_url" TEXT,
  "status" TEXT NOT NULL DEFAULT 'creating',
  "error" TEXT,
  "sent_at" TIMESTAMP(3),
  "signed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_contracts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_contracts_provider_doc_token_key" UNIQUE ("provider_doc_token"),
  CONSTRAINT "lead_contracts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lead_contracts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lead_contracts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "lead_contracts_tenant_id_idx" ON "lead_contracts"("tenant_id");
CREATE INDEX IF NOT EXISTS "lead_contracts_conversation_id_idx" ON "lead_contracts"("conversation_id");
CREATE INDEX IF NOT EXISTS "lead_contracts_lead_id_idx" ON "lead_contracts"("lead_id");
