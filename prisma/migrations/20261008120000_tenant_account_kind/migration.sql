-- Explicit tenant classification (client, internal test, technical access).
-- Additive only: one new column with a constant default, no existing data is changed.
-- The column must exist in the database BEFORE the application version that reads it is deployed.
ALTER TABLE "tenants"
  ADD COLUMN "account_kind" TEXT NOT NULL DEFAULT 'unclassified';

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_account_kind_check"
  CHECK ("account_kind" IN ('unclassified', 'client', 'internal_test', 'technical_access'));

CREATE INDEX "tenants_account_kind_idx" ON "tenants"("account_kind");
