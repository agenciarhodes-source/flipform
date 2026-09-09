-- Additive Flip AI foundation. Review/apply manually to the intended Neon branch.
-- Never run prisma migrate deploy against production.
CREATE TABLE "flip_ai_agents" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '', "primary_color" TEXT NOT NULL DEFAULT '#2563EB',
  "style" TEXT NOT NULL DEFAULT 'welcoming', "status" TEXT NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1, "pipeline_id" TEXT NOT NULL,
  "initial_stage_id" TEXT NOT NULL, "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "flip_ai_agents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_ai_agents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_agents_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_agents_initial_stage_id_fkey" FOREIGN KEY ("initial_stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_agents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "flip_ai_agents_tenant_id_id_key" ON "flip_ai_agents"("tenant_id", "id");
CREATE INDEX "flip_ai_agents_tenant_id_status_created_at_idx" ON "flip_ai_agents"("tenant_id", "status", "created_at");
CREATE TABLE "flip_ai_endpoints" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "agent_id" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "flip_ai_endpoints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_ai_endpoints_tenant_id_agent_id_fkey" FOREIGN KEY ("tenant_id", "agent_id")
    REFERENCES "flip_ai_agents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "flip_ai_endpoints_agent_id_key" ON "flip_ai_endpoints"("agent_id");
CREATE UNIQUE INDEX "flip_ai_endpoints_slug_key" ON "flip_ai_endpoints"("slug");
CREATE INDEX "flip_ai_endpoints_tenant_id_idx" ON "flip_ai_endpoints"("tenant_id");
