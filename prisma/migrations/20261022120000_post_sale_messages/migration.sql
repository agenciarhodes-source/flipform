-- After-sale messages: settings per company, each send, and who asked to stop.
-- Additive only: three new tables, everything starts switched off.
CREATE TABLE IF NOT EXISTS "post_sale_settings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "progress_enabled" BOOLEAN NOT NULL DEFAULT false,
  "progress_interval_days" INTEGER NOT NULL DEFAULT 30,
  "progress_template" TEXT,
  "review_enabled" BOOLEAN NOT NULL DEFAULT false,
  "review_after_days" INTEGER NOT NULL DEFAULT 15,
  "review_template" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_sale_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "post_sale_settings_tenant_id_key" UNIQUE ("tenant_id"),
  CONSTRAINT "post_sale_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "post_sale_sends" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "message_id" TEXT,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_sale_sends_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "post_sale_sends_kind_check" CHECK ("kind" IN ('progress', 'review')),
  CONSTRAINT "post_sale_sends_status_check" CHECK ("status" IN ('sent', 'failed', 'skipped')),
  CONSTRAINT "post_sale_sends_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "post_sale_sends_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "post_sale_sends_tenant_id_lead_id_kind_created_at_idx" ON "post_sale_sends"("tenant_id", "lead_id", "kind", "created_at");
CREATE TABLE IF NOT EXISTS "contact_opt_outs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_opt_outs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contact_opt_outs_tenant_id_phone_key" UNIQUE ("tenant_id", "phone"),
  CONSTRAINT "contact_opt_outs_source_check" CHECK ("source" IN ('keyword', 'team')),
  CONSTRAINT "contact_opt_outs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
