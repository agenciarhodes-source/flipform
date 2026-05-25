-- Drop global unique and enforce per-tenant uniqueness
DROP INDEX IF EXISTS "allowed_users_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS "allowed_users_tenant_id_email_key" ON "allowed_users"("tenant_id", "email");
