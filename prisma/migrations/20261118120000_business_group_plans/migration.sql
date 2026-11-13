-- Group plan (Plano Grupo): one store of a business group pays for every store of the group.
-- Additive only: one new table. Plans, subscriptions and companies are not changed here.
CREATE TABLE IF NOT EXISTS "business_group_plans" (
  "group_id" TEXT NOT NULL,
  "payer_tenant_id" TEXT NOT NULL,
  "base_price" DECIMAL(10,2) NOT NULL DEFAULT 997,
  "additional_store_price" DECIMAL(10,2) NOT NULL DEFAULT 297,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_group_plans_pkey" PRIMARY KEY ("group_id"),
  CONSTRAINT "business_group_plans_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "business_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "business_group_plans_payer_tenant_id_fkey" FOREIGN KEY ("payer_tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "business_group_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "business_group_plans_status_check" CHECK ("status" IN ('active', 'ended')),
  CONSTRAINT "business_group_plans_prices_check" CHECK ("base_price" > 0 AND "additional_store_price" >= 0)
);
CREATE INDEX IF NOT EXISTS "business_group_plans_payer_tenant_id_idx" ON "business_group_plans"("payer_tenant_id");
