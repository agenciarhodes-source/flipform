-- Ensure the allowlist table exists before all allowlist index/repair migrations.
-- Some legacy production databases are missing the physical allowed_users table
-- entirely, so migrations that only DROP/CREATE indexes or ALTER columns cannot
-- run and /admin/access returns DB_SCHEMA_NOT_READY.
--
-- Non-destructive: creates the table only when it does not exist and does not
-- delete or modify existing allowlist rows.

CREATE TABLE IF NOT EXISTS allowed_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  active BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'admin',
  invited_by TEXT,
  accepted_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS allowed_users_email_idx ON allowed_users(email);
CREATE INDEX IF NOT EXISTS allowed_users_tenant_id_idx ON allowed_users(tenant_id);
CREATE INDEX IF NOT EXISTS allowed_users_active_idx ON allowed_users(active);
CREATE UNIQUE INDEX IF NOT EXISTS allowed_users_tenant_id_email_key ON allowed_users(tenant_id, email);
