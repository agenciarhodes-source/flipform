CREATE TABLE "flip_ai_external_search_cache" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "query_hash" TEXT NOT NULL,
  "allowlist_hash" TEXT NOT NULL,
  "result_text" TEXT NOT NULL,
  "sources" JSONB NOT NULL,
  "model" TEXT NOT NULL,
  "response_id" TEXT NOT NULL,
  "searched_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flip_ai_external_search_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "flip_ai_external_search_cache_tenant_id_id_key"
  ON "flip_ai_external_search_cache"("tenant_id", "id");
CREATE UNIQUE INDEX "flip_ai_external_search_cache_tenant_agent_query_allowlist_key"
  ON "flip_ai_external_search_cache"("tenant_id", "agent_id", "query_hash", "allowlist_hash");
CREATE INDEX "flip_ai_external_search_cache_tenant_agent_expires_idx"
  ON "flip_ai_external_search_cache"("tenant_id", "agent_id", "expires_at");

ALTER TABLE "flip_ai_external_search_cache"
  ADD CONSTRAINT "flip_ai_external_search_cache_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_ai_external_search_cache"
  ADD CONSTRAINT "flip_ai_external_search_cache_tenant_id_agent_id_fkey"
  FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "flip_ai_agents"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
