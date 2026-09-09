-- Additive PR #268. Review and apply manually; never use prisma migrate deploy in production.
-- Premium catalog entries are created INACTIVE so unfinished Flip AI cannot be sold or assigned as live.
INSERT INTO "plans" (
  "id", "name", "slug", "description", "price", "billing_cycle", "max_users", "max_forms",
  "max_leads_per_month", "max_pipelines", "can_use_reports", "can_export_csv",
  "can_use_custom_branding", "can_use_meta_pixel", "can_use_webhooks", "can_use_tasks",
  "is_active", "created_at", "updated_at"
) VALUES
  ('00000000-0000-4000-8000-000000000797', 'Premium', 'premium', 'FlipForm Premium + consumo de IA', 797.00, 'monthly', 0, 0, 0, 0, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, NOW(), NOW()),
  ('00000000-0000-4000-8000-000000001497', 'Premium Pro', 'premium-pro', 'FlipForm Premium Pro + consumo de IA', 1497.00, 'monthly', 0, 0, 0, 0, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;


CREATE TABLE "flip_ai_knowledge_bases" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "agent_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "flip_ai_knowledge_bases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_ai_knowledge_bases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_knowledge_bases_tenant_id_agent_id_fkey" FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "flip_ai_agents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "flip_ai_knowledge_bases_agent_id_key" ON "flip_ai_knowledge_bases"("agent_id");
CREATE UNIQUE INDEX "flip_ai_knowledge_bases_tenant_id_id_key" ON "flip_ai_knowledge_bases"("tenant_id", "id");
CREATE UNIQUE INDEX "flip_ai_knowledge_bases_tenant_id_agent_id_key" ON "flip_ai_knowledge_bases"("tenant_id", "agent_id");
CREATE INDEX "flip_ai_knowledge_bases_tenant_id_status_idx" ON "flip_ai_knowledge_bases"("tenant_id", "status");

CREATE TABLE "flip_ai_knowledge_documents" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "knowledge_base_id" TEXT NOT NULL,
  "source_key" TEXT NOT NULL, "source_type" TEXT NOT NULL DEFAULT 'markdown', "title" TEXT NOT NULL,
  "current_revision" INTEGER NOT NULL DEFAULT 1, "current_hash" TEXT NOT NULL, "byte_size" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "flip_ai_knowledge_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_ai_knowledge_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_knowledge_documents_tenant_id_knowledge_base_id_fkey" FOREIGN KEY ("tenant_id", "knowledge_base_id") REFERENCES "flip_ai_knowledge_bases"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "flip_ai_knowledge_documents_tenant_id_id_key" ON "flip_ai_knowledge_documents"("tenant_id", "id");
CREATE UNIQUE INDEX "flip_ai_knowledge_documents_knowledge_base_id_source_key_key" ON "flip_ai_knowledge_documents"("knowledge_base_id", "source_key");
CREATE INDEX "flip_ai_knowledge_documents_tenant_id_updated_at_idx" ON "flip_ai_knowledge_documents"("tenant_id", "updated_at");

CREATE TABLE "flip_ai_knowledge_revisions" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "document_id" TEXT NOT NULL, "revision" INTEGER NOT NULL,
  "title" TEXT NOT NULL, "content" TEXT NOT NULL, "content_hash" TEXT NOT NULL, "byte_size" INTEGER NOT NULL,
  "created_by" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flip_ai_knowledge_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_ai_knowledge_revisions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_knowledge_revisions_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "flip_ai_knowledge_documents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_knowledge_revisions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "flip_ai_knowledge_revisions_document_id_revision_key" ON "flip_ai_knowledge_revisions"("document_id", "revision");
CREATE INDEX "flip_ai_knowledge_revisions_tenant_id_created_at_idx" ON "flip_ai_knowledge_revisions"("tenant_id", "created_at");
