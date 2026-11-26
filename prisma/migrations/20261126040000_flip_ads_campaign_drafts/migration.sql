-- PR-E: internal draft only; no provider execution or production migration approval.
CREATE TABLE "flip_ads_campaign_drafts" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "provider" TEXT NOT NULL, "account_id" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'draft', "revision" INTEGER NOT NULL DEFAULT 1, "plan" JSONB NOT NULL,
  "digest" TEXT NOT NULL, "created_by" TEXT NOT NULL, "approved_by" TEXT, "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "flip_ads_campaign_drafts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fad_state_check" CHECK ("state" IN ('draft','review','approved','rejected') AND "revision" >= 1
    AND (("state" = 'approved' AND "approved_by" IS NOT NULL AND "approved_at" IS NOT NULL)
      OR ("state" <> 'approved' AND "approved_by" IS NULL AND "approved_at" IS NULL))),
  CONSTRAINT "fad_provider_check" CHECK ("provider" IN ('meta_ads','google_ads')),
  CONSTRAINT "fad_digest_check" CHECK ("digest" ~ '^[0-9a-f]{64}$')
);
CREATE TABLE "flip_ads_draft_audits" (
  "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "draft_id" TEXT NOT NULL, "actor_id" TEXT NOT NULL,
  "action" TEXT NOT NULL, "revision" INTEGER NOT NULL, "digest" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flip_ads_draft_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fad_audit_check" CHECK ("action" IN ('created','edited','submitted','approved','rejected') AND "revision" >= 1 AND "digest" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "fad_scope_key" ON "flip_ads_campaign_drafts"("tenant_id","id");
CREATE INDEX "fad_state_idx" ON "flip_ads_campaign_drafts"("tenant_id","state","updated_at");
CREATE INDEX "fad_audit_scope_idx" ON "flip_ads_draft_audits"("tenant_id","draft_id","created_at");
ALTER TABLE "flip_ads_campaign_drafts" ADD CONSTRAINT "fad_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_ads_draft_audits" ADD CONSTRAINT "fad_audit_draft_fk" FOREIGN KEY ("tenant_id","draft_id") REFERENCES "flip_ads_campaign_drafts"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
