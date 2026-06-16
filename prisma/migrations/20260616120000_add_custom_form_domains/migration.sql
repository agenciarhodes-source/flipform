CREATE TABLE IF NOT EXISTS "custom_form_domains" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "verification_status" TEXT NOT NULL DEFAULT 'pending',
  "ssl_status" TEXT NOT NULL DEFAULT 'pending',
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "vercel_project_id" TEXT,
  "vercel_verified" BOOLEAN NOT NULL DEFAULT false,
  "verification_type" TEXT,
  "verification_domain" TEXT,
  "verification_value" TEXT,
  "verification_reason" TEXT,
  "dns_target" TEXT,
  "last_checked_at" TIMESTAMP(3),
  "verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custom_form_domains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "custom_form_domains_domain_key" ON "custom_form_domains"("domain");
CREATE INDEX IF NOT EXISTS "custom_form_domains_tenant_id_idx" ON "custom_form_domains"("tenant_id");
CREATE INDEX IF NOT EXISTS "custom_form_domains_domain_idx" ON "custom_form_domains"("domain");
CREATE INDEX IF NOT EXISTS "custom_form_domains_status_idx" ON "custom_form_domains"("status");
CREATE INDEX IF NOT EXISTS "custom_form_domains_tenant_id_is_primary_idx" ON "custom_form_domains"("tenant_id", "is_primary");

DO $$ BEGIN
  ALTER TABLE "custom_form_domains" ADD CONSTRAINT "custom_form_domains_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
