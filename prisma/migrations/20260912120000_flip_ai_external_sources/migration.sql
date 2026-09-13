CREATE TABLE "flip_ai_external_sources" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flip_ai_external_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "flip_ai_external_sources_tenant_id_id_key"
  ON "flip_ai_external_sources"("tenant_id", "id");
CREATE UNIQUE INDEX "flip_ai_external_sources_agent_id_domain_key"
  ON "flip_ai_external_sources"("agent_id", "domain");
CREATE INDEX "flip_ai_external_sources_tenant_id_agent_id_status_idx"
  ON "flip_ai_external_sources"("tenant_id", "agent_id", "status");

ALTER TABLE "flip_ai_external_sources"
  ADD CONSTRAINT "flip_ai_external_sources_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_ai_external_sources"
  ADD CONSTRAINT "flip_ai_external_sources_tenant_id_agent_id_fkey"
  FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "flip_ai_agents"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
