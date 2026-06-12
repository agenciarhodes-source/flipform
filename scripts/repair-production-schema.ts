import { prisma } from '@/lib/prisma';

type Step = { label: string; sql: string };

const steps: Step[] = [
  {
    label: 'allowed_users.create',
    sql: `CREATE TABLE IF NOT EXISTS allowed_users (
      id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
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
    )`,
  },
  { label: 'allowed_users.id', sql: `ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS id TEXT DEFAULT md5(random()::text || clock_timestamp()::text)` },
  { label: 'allowed_users.email', sql: `ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS email TEXT` },
  { label: 'allowed_users.tenant_id', sql: `ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS tenant_id TEXT` },
  { label: 'allowed_users.role', sql: `ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner'` },
  { label: 'allowed_users.active', sql: `ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true` },
  { label: 'allowed_users.status', sql: `ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'` },
  { label: 'allowed_users.source', sql: `ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin'` },
  { label: 'allowed_users.invited_by', sql: `ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS invited_by TEXT` },
  { label: 'allowed_users.invited_by.nullable', sql: `ALTER TABLE allowed_users ALTER COLUMN invited_by DROP NOT NULL` },
  { label: 'allowed_users.accepted_at', sql: `ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITHOUT TIME ZONE` },
  { label: 'allowed_users.created_at', sql: `ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'allowed_users.updated_at', sql: `ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'allowed_users.backfill.id', sql: `UPDATE allowed_users SET id = md5(random()::text || clock_timestamp()::text) WHERE id IS NULL OR id = ''` },
  { label: 'allowed_users.id.not_null', sql: `ALTER TABLE allowed_users ALTER COLUMN id SET NOT NULL` },
  { label: 'allowed_users.drop.email.constraint', sql: `ALTER TABLE allowed_users DROP CONSTRAINT IF EXISTS allowed_users_email_key` },
  { label: 'allowed_users.drop.email.index.lower', sql: `DROP INDEX IF EXISTS allowed_users_email_key` },
  { label: 'allowed_users.drop.email.index.prisma', sql: `DROP INDEX IF EXISTS "AllowedUser_email_key"` },
  { label: 'allowed_users.email.index', sql: `CREATE INDEX IF NOT EXISTS allowed_users_email_idx ON allowed_users(email)` },
  { label: 'allowed_users.tenant.index', sql: `CREATE INDEX IF NOT EXISTS allowed_users_tenant_id_idx ON allowed_users(tenant_id)` },
  { label: 'allowed_users.active.index', sql: `CREATE INDEX IF NOT EXISTS allowed_users_active_idx ON allowed_users(active)` },
  { label: 'allowed_users.tenant_email.unique', sql: `CREATE UNIQUE INDEX IF NOT EXISTS allowed_users_tenant_id_email_key ON allowed_users(tenant_id, email)` },

  { label: 'tenants.plan_id', sql: `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_id TEXT` },
  { label: 'tenants.next_due_date', sql: `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS next_due_date TIMESTAMP WITHOUT TIME ZONE` },
  { label: 'tenants.internal_notes', sql: `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS internal_notes TEXT` },
  { label: 'tenants.last_login_at', sql: `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITHOUT TIME ZONE` },
  { label: 'tenants.status', sql: `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'` },
  { label: 'tenants.created_at', sql: `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'tenants.updated_at', sql: `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },

  {
    label: 'plans.create',
    sql: `CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      name TEXT NOT NULL DEFAULT 'Plano',
      slug TEXT,
      description TEXT,
      price NUMERIC(10, 2) NOT NULL DEFAULT 0,
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      max_users INTEGER NOT NULL DEFAULT 0,
      max_forms INTEGER NOT NULL DEFAULT 0,
      max_leads_per_month INTEGER NOT NULL DEFAULT 0,
      max_pipelines INTEGER NOT NULL DEFAULT 0,
      can_use_reports BOOLEAN NOT NULL DEFAULT false,
      can_export_csv BOOLEAN NOT NULL DEFAULT false,
      can_use_custom_branding BOOLEAN NOT NULL DEFAULT false,
      can_use_meta_pixel BOOLEAN NOT NULL DEFAULT false,
      can_use_webhooks BOOLEAN NOT NULL DEFAULT false,
      can_use_tasks BOOLEAN NOT NULL DEFAULT true,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
    )`,
  },

  {
    label: 'subscriptions.create',
    sql: `CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      tenant_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'trialing',
      current_period_start TIMESTAMP WITHOUT TIME ZONE,
      current_period_end TIMESTAMP WITHOUT TIME ZONE,
      next_due_date TIMESTAMP WITHOUT TIME ZONE,
      provider TEXT NOT NULL DEFAULT 'asaas',
      payment_required BOOLEAN NOT NULL DEFAULT true,
      grace_period_ends_at TIMESTAMP WITHOUT TIME ZONE,
      payment_provider TEXT DEFAULT 'asaas',
      provider_customer_id TEXT,
      provider_subscription_id TEXT,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
      canceled_at TIMESTAMP WITHOUT TIME ZONE
    )`,
  },
  { label: 'subscriptions.id', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS id TEXT DEFAULT md5(random()::text || clock_timestamp()::text)` },
  { label: 'subscriptions.tenant_id', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS tenant_id TEXT` },
  { label: 'subscriptions.plan_id', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_id TEXT` },
  { label: 'subscriptions.status', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'trialing'` },
  { label: 'subscriptions.backfill.id', sql: `UPDATE subscriptions SET id = md5(random()::text || clock_timestamp()::text) WHERE id IS NULL OR id = ''` },
  { label: 'subscriptions.id.not_null', sql: `ALTER TABLE subscriptions ALTER COLUMN id SET NOT NULL` },
  { label: 'subscriptions.id.unique', sql: `CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_id_key ON subscriptions(id)` },
  { label: 'subscriptions.current_period_start', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMP WITHOUT TIME ZONE` },
  { label: 'subscriptions.current_period_end', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP WITHOUT TIME ZONE` },
  { label: 'subscriptions.next_due_date', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_due_date TIMESTAMP WITHOUT TIME ZONE` },
  { label: 'subscriptions.provider', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'asaas'` },
  { label: 'subscriptions.payment_required', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_required BOOLEAN NOT NULL DEFAULT true` },
  { label: 'subscriptions.grace_period_ends_at', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMP WITHOUT TIME ZONE` },
  { label: 'subscriptions.payment_provider', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'asaas'` },
  { label: 'subscriptions.provider_customer_id', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_customer_id TEXT` },
  { label: 'subscriptions.provider_subscription_id', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT` },
  { label: 'subscriptions.created_at', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'subscriptions.updated_at', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'subscriptions.canceled_at', sql: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP WITHOUT TIME ZONE` },
  { label: 'subscriptions.tenant.index', sql: `CREATE INDEX IF NOT EXISTS subscriptions_tenant_id_idx ON subscriptions(tenant_id)` },
  { label: 'subscriptions.tenant_status.index', sql: `CREATE INDEX IF NOT EXISTS subscriptions_tenant_id_status_idx ON subscriptions(tenant_id, status)` },
  { label: 'subscriptions.tenant_next_due_date.index', sql: `CREATE INDEX IF NOT EXISTS subscriptions_tenant_id_next_due_date_idx ON subscriptions(tenant_id, next_due_date)` },

  { label: 'plans.name', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Plano'` },
  { label: 'plans.slug', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS slug TEXT` },
  { label: 'plans.description', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS description TEXT` },
  { label: 'plans.price', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) NOT NULL DEFAULT 0` },
  { label: 'plans.billing_cycle', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'monthly'` },
  { label: 'plans.max_users', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 0` },
  { label: 'plans.max_forms', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_forms INTEGER NOT NULL DEFAULT 0` },
  { label: 'plans.max_leads_per_month', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_leads_per_month INTEGER NOT NULL DEFAULT 0` },
  { label: 'plans.max_pipelines', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_pipelines INTEGER NOT NULL DEFAULT 0` },
  { label: 'plans.can_use_reports', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS can_use_reports BOOLEAN NOT NULL DEFAULT false` },
  { label: 'plans.can_export_csv', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS can_export_csv BOOLEAN NOT NULL DEFAULT false` },
  { label: 'plans.can_use_custom_branding', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS can_use_custom_branding BOOLEAN NOT NULL DEFAULT false` },
  { label: 'plans.can_use_meta_pixel', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS can_use_meta_pixel BOOLEAN NOT NULL DEFAULT false` },
  { label: 'plans.can_use_webhooks', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS can_use_webhooks BOOLEAN NOT NULL DEFAULT false` },
  { label: 'plans.can_use_tasks', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS can_use_tasks BOOLEAN NOT NULL DEFAULT true` },
  { label: 'plans.is_active', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true` },
  { label: 'plans.created_at', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'plans.updated_at', sql: `ALTER TABLE plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'plans.backfill.slug', sql: `UPDATE plans SET slug = lower(regexp_replace(coalesce(nullif(name, ''), id::text), '[^a-zA-Z0-9]+', '-', 'g')) WHERE slug IS NULL OR slug = ''` },
  { label: 'plans.slug.unique', sql: `CREATE UNIQUE INDEX IF NOT EXISTS plans_slug_key ON plans(slug)` },

  { label: 'users.email.unique', sql: `CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users(email)` },
  { label: 'tenants.slug.unique', sql: `CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_key ON tenants(slug)` },
  { label: 'tenant_users.unique', sql: `CREATE UNIQUE INDEX IF NOT EXISTS tenant_users_tenant_id_user_id_key ON tenant_users(tenant_id, user_id)` },

  {
    label: 'audit_logs.create',
    sql: `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      tenant_id TEXT NOT NULL,
      user_id TEXT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
    )`,
  },
  { label: 'audit_logs.index', sql: `CREATE INDEX IF NOT EXISTS audit_logs_tenant_id_created_at_idx ON audit_logs(tenant_id, created_at)` },

  {
    label: 'payments.create',
    sql: `CREATE TABLE IF NOT EXISTS payments (
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
    )`,
  },
  { label: 'payments.id', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS id TEXT DEFAULT md5(random()::text || clock_timestamp()::text)` },
  { label: 'payments.tenant_id', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS tenant_id TEXT` },
  { label: 'payments.subscription_id', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS subscription_id TEXT` },
  { label: 'payments.provider', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'asaas'` },
  { label: 'payments.provider_payment_id', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payment_id TEXT` },
  { label: 'payments.status', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'` },
  { label: 'payments.value', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS value NUMERIC(10, 2) NOT NULL DEFAULT 0` },
  { label: 'payments.due_date', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS due_date TIMESTAMP WITHOUT TIME ZONE` },
  { label: 'payments.paid_at', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITHOUT TIME ZONE` },
  { label: 'payments.invoice_url', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_url TEXT` },
  { label: 'payments.bank_slip_url', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS bank_slip_url TEXT` },
  { label: 'payments.pix_qr_code', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS pix_qr_code TEXT` },
  { label: 'payments.billing_type', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS billing_type TEXT` },
  { label: 'payments.raw_payload', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS raw_payload JSONB` },
  { label: 'payments.created_at', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'payments.updated_at', sql: `ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'payments.backfill.id', sql: `UPDATE payments SET id = md5(random()::text || clock_timestamp()::text) WHERE id IS NULL OR id = ''` },
  { label: 'payments.id.not_null', sql: `ALTER TABLE payments ALTER COLUMN id SET NOT NULL` },
  { label: 'payments.id.unique', sql: `CREATE UNIQUE INDEX IF NOT EXISTS payments_id_key ON payments(id)` },
  { label: 'payments.tenant.index', sql: `CREATE INDEX IF NOT EXISTS payments_tenant_id_idx ON payments(tenant_id)` },
  { label: 'payments.status.index', sql: `CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status)` },
  { label: 'payments.tenant_status.index', sql: `CREATE INDEX IF NOT EXISTS payments_tenant_id_status_idx ON payments(tenant_id, status)` },
  { label: 'payments.tenant_due_date.index', sql: `CREATE INDEX IF NOT EXISTS payments_tenant_id_due_date_idx ON payments(tenant_id, due_date)` },
  { label: 'payments.tenant_created_at.index', sql: `CREATE INDEX IF NOT EXISTS payments_tenant_id_created_at_idx ON payments(tenant_id, created_at)` },

  { label: 'tenant_integration_settings.meta_access_token_encrypted', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS meta_access_token_encrypted TEXT` },
  { label: 'tenant_integration_settings.meta_test_event_code', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS meta_test_event_code TEXT` },
  { label: 'tenant_integration_settings.ga4_api_secret_encrypted', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS ga4_api_secret_encrypted TEXT` },
  { label: 'kanban_stage_tracking_events.conversion_label', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS conversion_label TEXT` },
  { label: 'kanban_stage_tracking_events.conversion_value', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS conversion_value NUMERIC(10, 2)` },
  { label: 'kanban_stage_tracking_events.currency', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL'` },
  { label: 'kanban_stage_tracking_events.metadata', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS metadata JSONB` },
  { label: 'kanban_stage_tracking_events.tenant_stage_provider.index', sql: `CREATE INDEX IF NOT EXISTS kanban_stage_tracking_events_tenant_stage_provider_idx ON kanban_stage_tracking_events(tenant_id, stage_id, provider)` },
  { label: 'tracking_event_logs.tenant_provider_created_at.index', sql: `CREATE INDEX IF NOT EXISTS tracking_event_logs_tenant_provider_created_at_idx ON tracking_event_logs(tenant_id, provider, created_at)` },
];

const defaultPlans: Step[] = [
  {
    label: 'plans.seed.starter',
    sql: `INSERT INTO plans (id, name, slug, description, price, billing_cycle, max_users, max_forms, max_leads_per_month, max_pipelines, can_use_reports, can_export_csv, can_use_custom_branding, can_use_meta_pixel, can_use_webhooks, can_use_tasks, is_active, created_at, updated_at)
      SELECT '710c951e-3df4-4d76-a035-ce90575c24c1', 'Starter', 'starter', 'Plano inicial para validação e primeiros formulários.', 97.00, 'monthly', 2, 3, 500, 1, false, true, false, false, false, true, true, now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM plans WHERE slug = 'starter' OR id = '710c951e-3df4-4d76-a035-ce90575c24c1')`,
  },
  {
    label: 'plans.seed.growth',
    sql: `INSERT INTO plans (id, name, slug, description, price, billing_cycle, max_users, max_forms, max_leads_per_month, max_pipelines, can_use_reports, can_export_csv, can_use_custom_branding, can_use_meta_pixel, can_use_webhooks, can_use_tasks, is_active, created_at, updated_at)
      SELECT '7ed5afde-2bbb-453f-9633-7127fd95f2cb', 'Growth', 'growth', 'Plano recomendado para operação comercial em crescimento.', 197.00, 'monthly', 5, 10, 3000, 3, true, true, true, true, false, true, true, now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM plans WHERE slug = 'growth' OR id = '7ed5afde-2bbb-453f-9633-7127fd95f2cb')`,
  },
  {
    label: 'plans.seed.pro',
    sql: `INSERT INTO plans (id, name, slug, description, price, billing_cycle, max_users, max_forms, max_leads_per_month, max_pipelines, can_use_reports, can_export_csv, can_use_custom_branding, can_use_meta_pixel, can_use_webhooks, can_use_tasks, is_active, created_at, updated_at)
      SELECT 'd25eef2b-4db4-49ac-ac76-c5665bf1780d', 'Pro', 'pro', 'Plano avançado para times e integrações.', 397.00, 'monthly', 15, 50, 20000, 10, true, true, true, true, true, true, true, now(), now()
      WHERE NOT EXISTS (SELECT 1 FROM plans WHERE slug = 'pro' OR id = 'd25eef2b-4db4-49ac-ac76-c5665bf1780d')`,
  },
];

const enumSteps: Step[] = [
  {
    label: 'enum.SubscriptionStatus.courtesy',
    sql: `DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionStatus')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'SubscriptionStatus' AND e.enumlabel = 'courtesy') THEN
    ALTER TYPE "SubscriptionStatus" ADD VALUE 'courtesy';
  END IF;
END $$`,
  },
  {
    label: 'enum.subscription_status.courtesy',
    sql: `DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'subscription_status' AND e.enumlabel = 'courtesy') THEN
    ALTER TYPE subscription_status ADD VALUE 'courtesy';
  END IF;
END $$`,
  },
];

async function runStep(step: Step) {
  await prisma.$executeRawUnsafe(step.sql);
  console.log(`OK: ${step.label}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurado.');
  console.log('Repairing production schema for admin manual access...');

  for (const step of enumSteps) await runStep(step);
  for (const step of steps) await runStep(step);
  for (const step of defaultPlans) await runStep(step);

  console.log('Schema repair finished. Run npm run admin:diagnose-schema next.');
}

main()
  .catch((error) => {
    console.error('FAIL: repair interrupted.', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
