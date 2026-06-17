-- Allow the same form slug in different tenants while keeping slugs unique inside a tenant.
DROP INDEX IF EXISTS "forms_slug_key";
DROP INDEX IF EXISTS forms_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS "forms_tenant_id_slug_key" ON "forms"("tenant_id", "slug");

-- Complete custom form domain readiness indexes.
CREATE INDEX IF NOT EXISTS "custom_form_domains_verification_status_idx" ON "custom_form_domains"("verification_status");
