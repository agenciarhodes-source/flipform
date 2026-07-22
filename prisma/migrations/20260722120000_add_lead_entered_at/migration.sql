-- Preserve the system creation timestamp while backfilling the commercial entry date.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "entered_at" TIMESTAMP(3);
UPDATE "leads" SET "entered_at" = "created_at" WHERE "entered_at" IS NULL;
ALTER TABLE "leads" ALTER COLUMN "entered_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "leads" ALTER COLUMN "entered_at" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "leads_tenant_id_entered_at_idx" ON "leads"("tenant_id", "entered_at");
