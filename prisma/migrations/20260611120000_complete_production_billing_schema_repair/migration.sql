-- Complete production schema repair for billing columns added to the current
-- Prisma schema after legacy manual admin access repairs. This migration is
-- intentionally idempotent and non-destructive: it adds missing columns and
-- indexes only, preserving existing production data.

-- Tenant billing denormalization used by access/billing checks.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS next_due_date TIMESTAMP WITHOUT TIME ZONE;

-- Subscription billing period/provider columns expected by Prisma.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_due_date TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'asaas';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_required BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'asaas';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_customer_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP WITHOUT TIME ZONE;

CREATE INDEX IF NOT EXISTS subscriptions_tenant_id_idx ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS subscriptions_tenant_id_status_idx ON subscriptions(tenant_id, status);
CREATE INDEX IF NOT EXISTS subscriptions_tenant_id_next_due_date_idx ON subscriptions(tenant_id, next_due_date);

-- Payments may already exist on partially repaired databases; CREATE TABLE does
-- not add missing columns to an existing table, so keep explicit column repairs.
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
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

ALTER TABLE payments ADD COLUMN IF NOT EXISTS id TEXT DEFAULT md5(random()::text || clock_timestamp()::text);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS subscription_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'asaas';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS value NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS due_date TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS bank_slip_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS pix_qr_code TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS billing_type TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS raw_payload JSONB;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();
UPDATE payments SET id = md5(random()::text || clock_timestamp()::text) WHERE id IS NULL OR id = '';
ALTER TABLE payments ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_id_key ON payments(id);

CREATE INDEX IF NOT EXISTS payments_tenant_id_idx ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status);
CREATE INDEX IF NOT EXISTS payments_tenant_id_status_idx ON payments(tenant_id, status);
CREATE INDEX IF NOT EXISTS payments_tenant_id_due_date_idx ON payments(tenant_id, due_date);
CREATE INDEX IF NOT EXISTS payments_tenant_id_created_at_idx ON payments(tenant_id, created_at);
