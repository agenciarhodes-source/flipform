-- Complete the admin manual access repair with schema objects that the
-- readiness check requires but the first repair migration intentionally did not
-- create. This remains non-destructive: it creates missing objects only and
-- does not delete or rewrite production data.

-- Core uniqueness expected by Prisma and the multi-tenant login/manual access flow.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_key ON tenants(slug);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_users_tenant_id_user_id_key ON tenant_users(tenant_id, user_id);

-- Audit table used best-effort by manual access creation and login. Missing audit
-- logging must not block access creation, but the production schema should still
-- include the table so diagnostics are clean.
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_tenant_id_created_at_idx ON audit_logs(tenant_id, created_at);

-- Payments table required by the billing schema. This does not alter checkout or
-- Asaas behavior; it only ensures legacy databases have the table expected by
-- Prisma and diagnostics.
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  subscription_id TEXT,
  provider TEXT NOT NULL DEFAULT 'asaas',
  provider_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  value NUMERIC(10, 2) NOT NULL DEFAULT 0,
  due_date TIMESTAMP WITHOUT TIME ZONE,
  paid_at TIMESTAMP WITHOUT TIME ZONE,
  invoice_url TEXT,
  bank_slip_url TEXT,
  pix_qr_code TEXT,
  billing_type TEXT,
  raw_payload JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_tenant_id_idx ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status);
CREATE INDEX IF NOT EXISTS payments_tenant_id_status_idx ON payments(tenant_id, status);
CREATE INDEX IF NOT EXISTS payments_tenant_id_due_date_idx ON payments(tenant_id, due_date);
CREATE INDEX IF NOT EXISTS payments_tenant_id_created_at_idx ON payments(tenant_id, created_at);
