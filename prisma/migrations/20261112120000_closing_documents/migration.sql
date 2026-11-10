-- "Documentos para finalizar o atendimento". Additive only: two new tables, nothing existing changes.
-- Starts switched off for every company.
CREATE TABLE IF NOT EXISTS "closing_document_settings" (
  "tenant_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "send_when" TEXT NOT NULL DEFAULT '',
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "closing_document_settings_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "closing_document_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "closing_document_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "closing_document_templates" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "object_key" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "placeholders" JSONB NOT NULL DEFAULT '{}',
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "closing_document_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "closing_document_templates_object_key_key" UNIQUE ("object_key"),
  CONSTRAINT "closing_document_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "closing_document_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "closing_document_templates_tenant_id_idx" ON "closing_document_templates"("tenant_id");
