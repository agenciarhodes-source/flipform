-- PR-C additive only; never apply to production as part of this PR.
CREATE TABLE "universal_sync_runs" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "connection_id" TEXT NOT NULL,
  "request_key" TEXT NOT NULL, "fixture_version" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued',
  "next_page" INTEGER NOT NULL DEFAULT 0, "attempts" INTEGER NOT NULL DEFAULT 0,
  "processed" INTEGER NOT NULL DEFAULT 0, "error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  "finished_at" TIMESTAMP(3),
  CONSTRAINT "universal_sync_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uc_sync_state_check" CHECK ("status" IN ('queued','succeeded','failed') AND "next_page" >= 0 AND "attempts" BETWEEN 0 AND 3 AND "processed" >= 0)
);
CREATE TABLE "universal_data_records" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "connection_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL, "provider_id" TEXT NOT NULL, "kind" TEXT NOT NULL, "source_id" TEXT NOT NULL,
  "source_updated_at" TIMESTAMP(3) NOT NULL, "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amount_minor" INTEGER NOT NULL, "currency" TEXT NOT NULL, "status" TEXT NOT NULL,
  CONSTRAINT "universal_data_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uc_data_synthetic_check" CHECK ("provider_id" = 'synthetic_finance' AND "kind" = 'receivable' AND "currency" = 'BRL' AND "status" IN ('open','paid') AND "amount_minor" >= 0)
);
CREATE UNIQUE INDEX "uc_sync_run_scope_key" ON "universal_sync_runs"("tenant_id","connection_id","id");
CREATE UNIQUE INDEX "uc_sync_run_request_key" ON "universal_sync_runs"("tenant_id","connection_id","request_key");
CREATE INDEX "uc_sync_run_queue_idx" ON "universal_sync_runs"("tenant_id","status","created_at");
CREATE UNIQUE INDEX "uc_data_source_key" ON "universal_data_records"("tenant_id","connection_id","kind","source_id");
CREATE INDEX "uc_data_scope_time_idx" ON "universal_data_records"("tenant_id","kind","source_updated_at");
ALTER TABLE "universal_sync_runs" ADD CONSTRAINT "uc_sync_connection_fk" FOREIGN KEY ("tenant_id","connection_id") REFERENCES "universal_connections"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "universal_data_records" ADD CONSTRAINT "uc_data_run_fk" FOREIGN KEY ("tenant_id","connection_id","run_id") REFERENCES "universal_sync_runs"("tenant_id","connection_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
