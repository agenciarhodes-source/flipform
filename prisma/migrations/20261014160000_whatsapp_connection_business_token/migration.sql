-- The business token Meta returns to Embedded Signup, kept per connection, encrypted.
-- Additive only: one nullable column. Applied in production on 2026-10-14 with authorization.
ALTER TABLE "tenant_whatsapp_connections" ADD COLUMN IF NOT EXISTS "access_token_encrypted" TEXT;
