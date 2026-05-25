-- Repair AllowedUser uniqueness and ensure plan table compatibility
DROP INDEX IF EXISTS "AllowedUser_email_key";
DROP INDEX IF EXISTS allowed_users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS allowed_users_tenant_id_email_key ON allowed_users(tenant_id, email);

-- Non-destructive placeholder for plan/subscription/tenant columns expected by Prisma schema.
-- If columns are missing in legacy DBs, apply targeted ALTER TABLE manually after diagnose.
