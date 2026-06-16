-- CreateTable
CREATE TABLE "custom_form_domains" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "verification_status" TEXT NOT NULL DEFAULT 'pending',
  "ssl_status" TEXT NOT NULL DEFAULT 'pending',
  "vercel_project_id" TEXT,
  "vercel_verified" BOOLEAN NOT NULL DEFAULT false,
  "verification_type" TEXT,
  "verification_domain" TEXT,
  "verification_value" TEXT,
  "verification_reason" TEXT,
  "dns_target" TEXT,
  "default_form_id" TEXT,
  "last_checked_at" TIMESTAMP(3),
  "verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custom_form_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_form_domain_routes" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "domain_id" TEXT NOT NULL,
  "form_id" TEXT NOT NULL,
  "path" TEXT NOT NULL DEFAULT '/',
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custom_form_domain_routes_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "custom_form_domains_domain_key" ON "custom_form_domains"("domain");
CREATE INDEX "custom_form_domains_tenant_id_idx" ON "custom_form_domains"("tenant_id");
CREATE INDEX "custom_form_domains_domain_idx" ON "custom_form_domains"("domain");
CREATE INDEX "custom_form_domains_status_idx" ON "custom_form_domains"("status");
CREATE INDEX "custom_form_domain_routes_tenant_id_idx" ON "custom_form_domain_routes"("tenant_id");
CREATE INDEX "custom_form_domain_routes_domain_id_idx" ON "custom_form_domain_routes"("domain_id");
CREATE INDEX "custom_form_domain_routes_form_id_idx" ON "custom_form_domain_routes"("form_id");
CREATE UNIQUE INDEX "custom_form_domain_routes_domain_id_path_key" ON "custom_form_domain_routes"("domain_id", "path");

-- ForeignKeys
ALTER TABLE "custom_form_domains" ADD CONSTRAINT "custom_form_domains_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "custom_form_domains" ADD CONSTRAINT "custom_form_domains_default_form_id_fkey" FOREIGN KEY ("default_form_id") REFERENCES "forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "custom_form_domain_routes" ADD CONSTRAINT "custom_form_domain_routes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "custom_form_domain_routes" ADD CONSTRAINT "custom_form_domain_routes_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "custom_form_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "custom_form_domain_routes" ADD CONSTRAINT "custom_form_domain_routes_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
