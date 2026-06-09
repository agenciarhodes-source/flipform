-- Stabilize manual admin access creation for legacy production databases.
-- This migration is intentionally non-destructive: it only adds missing columns,
-- relaxes the legacy invited_by nullability, removes the obsolete global email
-- unique constraint on allowed_users, and seeds default active plans when absent.

-- Enums used by Prisma in current and older databases.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionStatus')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_enum e
       JOIN pg_type t ON e.enumtypid = t.oid
       WHERE t.typname = 'SubscriptionStatus'
       AND e.enumlabel = 'courtesy'
     ) THEN
    ALTER TYPE "SubscriptionStatus" ADD VALUE 'courtesy';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_enum e
       JOIN pg_type t ON e.enumtypid = t.oid
       WHERE t.typname = 'subscription_status'
       AND e.enumlabel = 'courtesy'
     ) THEN
    ALTER TYPE subscription_status ADD VALUE 'courtesy';
  END IF;
END $$;

-- Tenants expected by manual/internal access.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();

-- Allowed users expected by multi-tenant allowlist access.
ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS invited_by TEXT;
ALTER TABLE allowed_users ALTER COLUMN invited_by DROP NOT NULL;
ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();
ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();

ALTER TABLE allowed_users DROP CONSTRAINT IF EXISTS allowed_users_email_key;
DROP INDEX IF EXISTS allowed_users_email_key;
DROP INDEX IF EXISTS "AllowedUser_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS allowed_users_tenant_id_email_key
ON allowed_users(tenant_id, email);

-- Subscription columns needed by courtesy/manual subscriptions.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'asaas';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_required BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'asaas';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();

-- Plan compatibility and non-destructive defaults.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_forms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_leads_per_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_pipelines INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS can_use_reports BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS can_export_csv BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS can_use_custom_branding BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS can_use_meta_pixel BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS can_use_webhooks BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS can_use_tasks BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();
ALTER TABLE plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();
UPDATE plans
SET slug = lower(regexp_replace(coalesce(nullif(name, ''), id::text), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';
CREATE UNIQUE INDEX IF NOT EXISTS plans_slug_key ON plans(slug);

INSERT INTO plans (id, name, slug, description, price, billing_cycle, max_users, max_forms, max_pipelines, max_leads_per_month, can_use_reports, can_export_csv, can_use_custom_branding, can_use_meta_pixel, can_use_webhooks, can_use_tasks, is_active, created_at, updated_at)
SELECT '710c951e-3df4-4d76-a035-ce90575c24c1', 'Starter', 'starter', 'Plano inicial para validação e primeiros formulários.', 97.00, 'monthly', 2, 3, 1, 500, false, true, false, false, false, true, true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE slug = 'starter');

INSERT INTO plans (id, name, slug, description, price, billing_cycle, max_users, max_forms, max_pipelines, max_leads_per_month, can_use_reports, can_export_csv, can_use_custom_branding, can_use_meta_pixel, can_use_webhooks, can_use_tasks, is_active, created_at, updated_at)
SELECT '7ed5afde-2bbb-453f-9633-7127fd95f2cb', 'Growth', 'growth', 'Plano recomendado para operação comercial em crescimento.', 197.00, 'monthly', 5, 10, 3, 3000, true, true, true, true, false, true, true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE slug = 'growth');

INSERT INTO plans (id, name, slug, description, price, billing_cycle, max_users, max_forms, max_pipelines, max_leads_per_month, can_use_reports, can_export_csv, can_use_custom_branding, can_use_meta_pixel, can_use_webhooks, can_use_tasks, is_active, created_at, updated_at)
SELECT 'd25eef2b-4db4-49ac-ac76-c5665bf1780d', 'Pro', 'pro', 'Plano avançado para times e integrações.', 397.00, 'monthly', 15, 50, 10, 20000, true, true, true, true, true, true, true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE slug = 'pro');
