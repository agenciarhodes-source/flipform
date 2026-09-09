-- Additive PR #269. Review and apply manually; never use prisma migrate deploy in production.
-- pgvector is available on the production Neon project, but this migration is not applied by this PR.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE UNIQUE INDEX "flip_ai_knowledge_revisions_tenant_id_document_id_revision_key"
  ON "flip_ai_knowledge_revisions"("tenant_id", "document_id", "revision");

CREATE TABLE "flip_ai_knowledge_indexes" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "agent_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL, "revision" INTEGER NOT NULL, "content_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending', "embedding_model" TEXT NOT NULL,
  "embedding_dimensions" INTEGER NOT NULL, "chunk_count" INTEGER NOT NULL,
  "input_tokens" INTEGER, "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" TEXT, "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "flip_ai_knowledge_indexes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_ai_knowledge_indexes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_knowledge_indexes_tenant_id_agent_id_fkey" FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "flip_ai_agents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_knowledge_indexes_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "flip_ai_knowledge_documents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_knowledge_indexes_source_revision_fkey" FOREIGN KEY ("tenant_id", "document_id", "revision") REFERENCES "flip_ai_knowledge_revisions"("tenant_id", "document_id", "revision") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "flip_ai_knowledge_indexes_tenant_id_id_key" ON "flip_ai_knowledge_indexes"("tenant_id", "id");
CREATE UNIQUE INDEX "flip_ai_knowledge_indexes_document_id_revision_embedding_model_key" ON "flip_ai_knowledge_indexes"("document_id", "revision", "embedding_model");
CREATE INDEX "flip_ai_knowledge_indexes_tenant_id_agent_id_status_idx" ON "flip_ai_knowledge_indexes"("tenant_id", "agent_id", "status");

CREATE TABLE "flip_ai_knowledge_index_batches" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "index_id" TEXT NOT NULL, "ordinal" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending', "byte_size" INTEGER NOT NULL, "input_tokens" INTEGER,
  "attempt_count" INTEGER NOT NULL DEFAULT 0, "last_error_code" TEXT,
  "started_at" TIMESTAMP(3), "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "flip_ai_knowledge_index_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_ai_knowledge_index_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_knowledge_index_batches_tenant_id_index_id_fkey" FOREIGN KEY ("tenant_id", "index_id") REFERENCES "flip_ai_knowledge_indexes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "flip_ai_knowledge_index_batches_tenant_id_id_key" ON "flip_ai_knowledge_index_batches"("tenant_id", "id");
CREATE UNIQUE INDEX "flip_ai_knowledge_index_batches_index_id_ordinal_key" ON "flip_ai_knowledge_index_batches"("index_id", "ordinal");
CREATE INDEX "flip_ai_knowledge_index_batches_tenant_id_status_created_at_idx" ON "flip_ai_knowledge_index_batches"("tenant_id", "status", "created_at");

CREATE TABLE "flip_ai_knowledge_chunks" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "index_id" TEXT NOT NULL, "batch_id" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL, "heading" TEXT, "content" TEXT NOT NULL, "content_hash" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL, "token_estimate" INTEGER NOT NULL, "embedding" vector(1536),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flip_ai_knowledge_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_ai_knowledge_chunks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_knowledge_chunks_tenant_id_index_id_fkey" FOREIGN KEY ("tenant_id", "index_id") REFERENCES "flip_ai_knowledge_indexes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_knowledge_chunks_tenant_id_batch_id_fkey" FOREIGN KEY ("tenant_id", "batch_id") REFERENCES "flip_ai_knowledge_index_batches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "flip_ai_knowledge_chunks_index_id_ordinal_key" ON "flip_ai_knowledge_chunks"("index_id", "ordinal");
CREATE INDEX "flip_ai_knowledge_chunks_tenant_id_index_id_idx" ON "flip_ai_knowledge_chunks"("tenant_id", "index_id");
CREATE INDEX "flip_ai_knowledge_chunks_embedding_hnsw_idx" ON "flip_ai_knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE "flip_ai_usage_events" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "agent_id" TEXT, "request_key" TEXT NOT NULL,
  "operation" TEXT NOT NULL, "provider" TEXT NOT NULL, "model" TEXT NOT NULL, "status" TEXT NOT NULL,
  "input_tokens" INTEGER, "output_tokens" INTEGER, "units" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flip_ai_usage_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_ai_usage_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_usage_events_tenant_id_agent_id_fkey" FOREIGN KEY ("tenant_id", "agent_id") REFERENCES "flip_ai_agents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "flip_ai_usage_events_request_key_key" ON "flip_ai_usage_events"("request_key");
CREATE INDEX "flip_ai_usage_events_tenant_id_created_at_idx" ON "flip_ai_usage_events"("tenant_id", "created_at");
CREATE INDEX "flip_ai_usage_events_tenant_id_operation_status_idx" ON "flip_ai_usage_events"("tenant_id", "operation", "status");
