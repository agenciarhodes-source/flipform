-- Security protocol S5: two-step verification (TOTP, Google Authenticator). Additive only: five
-- columns, all empty or default, so nobody's sign-in changes until they turn it on.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_secret_encrypted" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_pending_secret_encrypted" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_enabled_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_last_counter" INTEGER;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_recovery_hashes" JSONB NOT NULL DEFAULT '[]';
