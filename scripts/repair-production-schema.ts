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

  { label: 'forms.disqualification_settings', sql: `ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS disqualification_settings JSONB` },
  { label: 'forms.lead_source', sql: `ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS lead_source TEXT` },
  { label: 'forms.lead_source.backfill', sql: `UPDATE public.forms SET lead_source = 'formulario' WHERE lead_source IS NULL OR btrim(lead_source) = ''` },
  { label: 'forms.lead_source.default', sql: `ALTER TABLE public.forms ALTER COLUMN lead_source SET DEFAULT 'formulario'` },
  { label: 'forms.lead_source.not_null', sql: `ALTER TABLE public.forms ALTER COLUMN lead_source SET NOT NULL` },
  { label: 'forms.tenant_lead_source.index', sql: `CREATE INDEX IF NOT EXISTS forms_tenant_id_lead_source_idx ON public.forms(tenant_id, lead_source)` },
  { label: 'leads.tenant_source.index', sql: `CREATE INDEX IF NOT EXISTS leads_tenant_id_source_idx ON public.leads(tenant_id, source)` },
  { label: 'forms.drop.slug.constraint', sql: `ALTER TABLE forms DROP CONSTRAINT IF EXISTS forms_slug_key` },
  { label: 'forms.drop.slug.index.lower', sql: `DROP INDEX IF EXISTS forms_slug_key` },
  { label: 'forms.drop.slug.index.quoted', sql: `DROP INDEX IF EXISTS "forms_slug_key"` },
  { label: 'forms.drop.slug.index.prisma', sql: `DROP INDEX IF EXISTS "Form_slug_key"` },
  { label: 'forms.tenant_slug.unique', sql: `CREATE UNIQUE INDEX IF NOT EXISTS forms_tenant_id_slug_key ON forms(tenant_id, slug)` },
  { label: 'forms.tenant_created_at.index', sql: `CREATE INDEX IF NOT EXISTS forms_tenant_id_created_at_idx ON forms(tenant_id, created_at)` },
  { label: 'forms.tenant_pipeline.index', sql: `CREATE INDEX IF NOT EXISTS forms_tenant_id_pipeline_id_idx ON forms(tenant_id, pipeline_id)` },
  { label: 'forms.tenant_active.index', sql: `CREATE INDEX IF NOT EXISTS forms_tenant_id_is_active_idx ON forms(tenant_id, is_active)` },

  { label: 'leads.sale_value_cents', sql: `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sale_value_cents INTEGER` },
  { label: 'leads.sale_currency', sql: `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sale_currency TEXT NOT NULL DEFAULT 'BRL'` },
  { label: 'leads.sale_value_updated_at', sql: `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sale_value_updated_at TIMESTAMP(3)` },
  { label: 'leads.sale_value_updated_by', sql: `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sale_value_updated_by TEXT` },
  { label: 'leads.state', sql: `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS state TEXT` },
  { label: 'leads.city', sql: `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS city TEXT` },
  { label: 'leads_tenant_state_idx', sql: `CREATE INDEX IF NOT EXISTS leads_tenant_state_idx ON public.leads(tenant_id, state)` },
  { label: 'leads_tenant_city_idx', sql: `CREATE INDEX IF NOT EXISTS leads_tenant_city_idx ON public.leads(tenant_id, city)` },
  { label: 'leads_tenant_state_city_idx', sql: `CREATE INDEX IF NOT EXISTS leads_tenant_state_city_idx ON public.leads(tenant_id, state, city)` },

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


  {
    label: 'tenant_integration_settings.create',
    sql: `CREATE TABLE IF NOT EXISTS tenant_integration_settings (
      id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      tenant_id TEXT NOT NULL,
      meta_pixel_enabled BOOLEAN NOT NULL DEFAULT false,
      meta_pixel_id TEXT,
      meta_access_token_encrypted TEXT,
      meta_test_event_code TEXT,
      gtm_enabled BOOLEAN NOT NULL DEFAULT false,
      gtm_container_id TEXT,
      ga4_enabled BOOLEAN NOT NULL DEFAULT false,
      ga4_measurement_id TEXT,
      ga4_api_secret_encrypted TEXT,
      google_ads_enabled BOOLEAN NOT NULL DEFAULT false,
      google_ads_id TEXT,
      google_ads_label TEXT,
      whatsapp_funnel_enabled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
    )`,
  },
  {
    label: 'kanban_stage_tracking_events.create',
    sql: `CREATE TABLE IF NOT EXISTS kanban_stage_tracking_events (
      id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      tenant_id TEXT NOT NULL,
      pipeline_id TEXT,
      stage_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      event_name TEXT NOT NULL,
      custom_event_name TEXT,
      conversion_label TEXT,
      conversion_value NUMERIC(10, 2),
      currency TEXT NOT NULL DEFAULT 'BRL',
      metadata JSONB,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
    )`,
  },
  {
    label: 'tracking_event_logs.create',
    sql: `CREATE TABLE IF NOT EXISTS tracking_event_logs (
      id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      tenant_id TEXT NOT NULL,
      lead_id TEXT,
      pipeline_id TEXT,
      from_stage_id TEXT,
      to_stage_id TEXT,
      provider TEXT NOT NULL,
      event_name TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT,
      triggered_by_id TEXT,
      event_id TEXT,
      conversation_id TEXT,
      message_id TEXT,
      trigger_rule_id TEXT,
      message_direction TEXT,
      source TEXT,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
    )`,
  },
  { label: 'tenant_integration_settings.id', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS id TEXT DEFAULT md5(random()::text || clock_timestamp()::text)` },
  { label: 'tenant_integration_settings.tenant_id', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS tenant_id TEXT` },
  { label: 'tenant_integration_settings.meta_pixel_enabled', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS meta_pixel_enabled BOOLEAN NOT NULL DEFAULT false` },
  { label: 'tenant_integration_settings.meta_pixel_id', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT` },
  { label: 'tenant_integration_settings.meta_access_token_encrypted', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS meta_access_token_encrypted TEXT` },
  { label: 'tenant_integration_settings.meta_test_event_code', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS meta_test_event_code TEXT` },
  { label: 'tenant_integration_settings.ga4_api_secret_encrypted', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS ga4_api_secret_encrypted TEXT` },
  { label: 'tenant_integration_settings.gtm_enabled', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS gtm_enabled BOOLEAN NOT NULL DEFAULT false` },
  { label: 'tenant_integration_settings.gtm_container_id', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS gtm_container_id TEXT` },
  { label: 'tenant_integration_settings.ga4_enabled', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS ga4_enabled BOOLEAN NOT NULL DEFAULT false` },
  { label: 'tenant_integration_settings.ga4_measurement_id', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS ga4_measurement_id TEXT` },
  { label: 'tenant_integration_settings.google_ads_enabled', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS google_ads_enabled BOOLEAN NOT NULL DEFAULT false` },
  { label: 'tenant_integration_settings.google_ads_id', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS google_ads_id TEXT` },
  { label: 'tenant_integration_settings.google_ads_label', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS google_ads_label TEXT` },
  { label: 'tenant_integration_settings.whatsapp_funnel_enabled', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS whatsapp_funnel_enabled BOOLEAN NOT NULL DEFAULT false` },
  { label: 'tenant_integration_settings.created_at', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'tenant_integration_settings.updated_at', sql: `ALTER TABLE tenant_integration_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'kanban_stage_tracking_events.id', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS id TEXT DEFAULT md5(random()::text || clock_timestamp()::text)` },
  { label: 'kanban_stage_tracking_events.tenant_id', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS tenant_id TEXT` },
  { label: 'kanban_stage_tracking_events.pipeline_id', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS pipeline_id TEXT` },
  { label: 'kanban_stage_tracking_events.stage_id', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS stage_id TEXT` },
  { label: 'kanban_stage_tracking_events.provider', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS provider TEXT` },
  { label: 'kanban_stage_tracking_events.event_name', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS event_name TEXT` },
  { label: 'kanban_stage_tracking_events.custom_event_name', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS custom_event_name TEXT` },
  { label: 'kanban_stage_tracking_events.conversion_label', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS conversion_label TEXT` },
  { label: 'kanban_stage_tracking_events.conversion_value', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS conversion_value NUMERIC(10, 2)` },
  { label: 'kanban_stage_tracking_events.currency', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL'` },
  { label: 'kanban_stage_tracking_events.metadata', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS metadata JSONB` },
  { label: 'kanban_stage_tracking_events.enabled', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true` },
  { label: 'kanban_stage_tracking_events.created_at', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'kanban_stage_tracking_events.updated_at', sql: `ALTER TABLE kanban_stage_tracking_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'kanban_stage_tracking_events.tenant_stage_provider.index', sql: `CREATE INDEX IF NOT EXISTS kanban_stage_tracking_events_tenant_stage_provider_idx ON kanban_stage_tracking_events(tenant_id, stage_id, provider)` },
  { label: 'tenant_integration_settings.tenant_id.unique', sql: `CREATE UNIQUE INDEX IF NOT EXISTS tenant_integration_settings_tenant_id_key ON tenant_integration_settings(tenant_id)` },
  { label: 'tenant_integration_settings.tenant_id.index', sql: `CREATE INDEX IF NOT EXISTS tenant_integration_settings_tenant_id_idx ON tenant_integration_settings(tenant_id)` },
  { label: 'kanban_stage_tracking_events.tenant_id.index', sql: `CREATE INDEX IF NOT EXISTS kanban_stage_tracking_events_tenant_id_idx ON kanban_stage_tracking_events(tenant_id)` },
  { label: 'kanban_stage_tracking_events.stage_id.index', sql: `CREATE INDEX IF NOT EXISTS kanban_stage_tracking_events_stage_id_idx ON kanban_stage_tracking_events(stage_id)` },
  { label: 'tracking_event_logs.id', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS id TEXT DEFAULT md5(random()::text || clock_timestamp()::text)` },
  { label: 'tracking_event_logs.tenant_id', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT` },
  { label: 'tracking_event_logs.lead_id', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS lead_id TEXT` },
  { label: 'tracking_event_logs.pipeline_id', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS pipeline_id TEXT` },
  { label: 'tracking_event_logs.from_stage_id', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS from_stage_id TEXT` },
  { label: 'tracking_event_logs.to_stage_id', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS to_stage_id TEXT` },
  { label: 'tracking_event_logs.provider', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS provider TEXT` },
  { label: 'tracking_event_logs.event_name', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS event_name TEXT` },
  { label: 'tracking_event_logs.status', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS status TEXT` },
  { label: 'tracking_event_logs.reason', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS reason TEXT` },
  { label: 'tracking_event_logs.triggered_by_id', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS triggered_by_id TEXT` },
  { label: 'tracking_event_logs.event_id', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS event_id TEXT` },
  { label: 'tracking_event_logs.conversation_id', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS conversation_id TEXT` },
  { label: 'tracking_event_logs.message_id', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS message_id TEXT` },
  { label: 'tracking_event_logs.trigger_rule_id', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS trigger_rule_id TEXT` },
  { label: 'tracking_event_logs.message_direction', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS message_direction TEXT` },
  { label: 'tracking_event_logs.source', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS source TEXT` },
  { label: 'tracking_event_logs.created_at', sql: `ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },

  {
    label: 'whatsapp_event_triggers.create',
    sql: `CREATE TABLE IF NOT EXISTS whatsapp_event_triggers (
      id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text), tenant_id TEXT NOT NULL, name TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0, trigger_phrase TEXT NOT NULL, match_type TEXT NOT NULL DEFAULT 'exact', provider TEXT NOT NULL DEFAULT 'meta',
      event_name TEXT NOT NULL, custom_event_name TEXT, conversion_value NUMERIC(10, 2), currency TEXT NOT NULL DEFAULT 'BRL', pipeline_id TEXT, stage_id TEXT,
      once_per_lead BOOLEAN NOT NULL DEFAULT true, require_exact_match BOOLEAN NOT NULL DEFAULT true, enabled BOOLEAN NOT NULL DEFAULT true,
      last_triggered_at TIMESTAMP WITHOUT TIME ZONE, created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(), updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
    )`,
  },
  { label: 'whatsapp_event_triggers.id', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS id TEXT DEFAULT md5(random()::text || clock_timestamp()::text)` },
  { label: 'whatsapp_event_triggers.tenant_id', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS tenant_id TEXT` },
  { label: 'whatsapp_event_triggers.name', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS name TEXT` },
  { label: 'whatsapp_event_triggers.order_index', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0` },
  { label: 'whatsapp_event_triggers.trigger_phrase', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS trigger_phrase TEXT` },
  { label: 'whatsapp_event_triggers.match_type', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS match_type TEXT NOT NULL DEFAULT 'exact'` },
  { label: 'whatsapp_event_triggers.provider', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'meta'` },
  { label: 'whatsapp_event_triggers.event_name', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS event_name TEXT` },
  { label: 'whatsapp_event_triggers.custom_event_name', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS custom_event_name TEXT` },
  { label: 'whatsapp_event_triggers.conversion_value', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS conversion_value NUMERIC(10, 2)` },
  { label: 'whatsapp_event_triggers.currency', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL'` },
  { label: 'whatsapp_event_triggers.pipeline_id', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS pipeline_id TEXT` },
  { label: 'whatsapp_event_triggers.stage_id', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS stage_id TEXT` },
  { label: 'whatsapp_event_triggers.once_per_lead', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS once_per_lead BOOLEAN NOT NULL DEFAULT true` },
  { label: 'whatsapp_event_triggers.require_exact_match', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS require_exact_match BOOLEAN NOT NULL DEFAULT true` },
  { label: 'whatsapp_event_triggers.enabled', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true` },
  { label: 'whatsapp_event_triggers.last_triggered_at', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMP WITHOUT TIME ZONE` },
  { label: 'whatsapp_event_triggers.created_at', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'whatsapp_event_triggers.updated_at', sql: `ALTER TABLE whatsapp_event_triggers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'whatsapp_event_triggers.index', sql: `CREATE INDEX IF NOT EXISTS whatsapp_event_triggers_tenant_id_idx ON whatsapp_event_triggers(tenant_id)` },
  { label: 'whatsapp_event_triggers.enabled_order.index', sql: `CREATE INDEX IF NOT EXISTS whatsapp_event_triggers_tenant_enabled_order_idx ON whatsapp_event_triggers(tenant_id, enabled, order_index)` },
  { label: 'whatsapp_event_triggers.pipeline_id.index', sql: `CREATE INDEX IF NOT EXISTS whatsapp_event_triggers_pipeline_id_idx ON whatsapp_event_triggers(pipeline_id)` },
  { label: 'whatsapp_event_triggers.stage_id.index', sql: `CREATE INDEX IF NOT EXISTS whatsapp_event_triggers_stage_id_idx ON whatsapp_event_triggers(stage_id)` },
  { label: 'whatsapp_event_triggers.unique', sql: `CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_event_triggers_tenant_phrase_match_key ON whatsapp_event_triggers(tenant_id, trigger_phrase, match_type)` },
  { label: 'tracking_event_logs.tenant_id.index', sql: `CREATE INDEX IF NOT EXISTS tracking_event_logs_tenant_id_idx ON tracking_event_logs(tenant_id)` },
  { label: 'tracking_event_logs.lead_id.index', sql: `CREATE INDEX IF NOT EXISTS tracking_event_logs_lead_id_idx ON tracking_event_logs(lead_id)` },
  { label: 'tracking_event_logs.created_at.index', sql: `CREATE INDEX IF NOT EXISTS tracking_event_logs_created_at_idx ON tracking_event_logs(created_at)` },
  { label: 'tracking_event_logs.tenant_provider_created_at.index', sql: `CREATE INDEX IF NOT EXISTS tracking_event_logs_tenant_provider_created_at_idx ON tracking_event_logs(tenant_id, provider, created_at)` },
  { label: 'tracking_event_logs.tenant_trigger_rule_event.index', sql: `CREATE INDEX IF NOT EXISTS tracking_event_logs_tenant_trigger_rule_event_idx ON tracking_event_logs(tenant_id, trigger_rule_id, event_name)` },
  { label: 'tracking_event_logs.tenant_conversation.index', sql: `CREATE INDEX IF NOT EXISTS tracking_event_logs_tenant_conversation_idx ON tracking_event_logs(tenant_id, conversation_id)` },

  {
    label: 'custom_form_domains.create',
    sql: `CREATE TABLE IF NOT EXISTS custom_form_domains (
      id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      tenant_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      verification_status TEXT NOT NULL DEFAULT 'pending',
      ssl_status TEXT NOT NULL DEFAULT 'pending',
      is_primary BOOLEAN NOT NULL DEFAULT false,
      vercel_project_id TEXT,
      vercel_verified BOOLEAN NOT NULL DEFAULT false,
      verification_type TEXT,
      verification_domain TEXT,
      verification_value TEXT,
      verification_reason TEXT,
      dns_target TEXT,
      last_checked_at TIMESTAMP WITHOUT TIME ZONE,
      verified_at TIMESTAMP WITHOUT TIME ZONE,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
    )`,
  },
  { label: 'custom_form_domains.id', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS id TEXT DEFAULT md5(random()::text || clock_timestamp()::text)` },
  { label: 'custom_form_domains.tenant_id', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS tenant_id TEXT` },
  { label: 'custom_form_domains.domain', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS domain TEXT` },
  { label: 'custom_form_domains.status', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'` },
  { label: 'custom_form_domains.verification_status', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending'` },
  { label: 'custom_form_domains.ssl_status', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS ssl_status TEXT NOT NULL DEFAULT 'pending'` },
  { label: 'custom_form_domains.is_primary', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false` },
  { label: 'custom_form_domains.vercel_project_id', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS vercel_project_id TEXT` },
  { label: 'custom_form_domains.vercel_verified', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS vercel_verified BOOLEAN NOT NULL DEFAULT false` },
  { label: 'custom_form_domains.verification_type', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS verification_type TEXT` },
  { label: 'custom_form_domains.verification_domain', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS verification_domain TEXT` },
  { label: 'custom_form_domains.verification_value', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS verification_value TEXT` },
  { label: 'custom_form_domains.verification_reason', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS verification_reason TEXT` },
  { label: 'custom_form_domains.dns_target', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS dns_target TEXT` },
  { label: 'custom_form_domains.last_checked_at', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP WITHOUT TIME ZONE` },
  { label: 'custom_form_domains.verified_at', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITHOUT TIME ZONE` },
  { label: 'custom_form_domains.created_at', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'custom_form_domains.updated_at', sql: `ALTER TABLE custom_form_domains ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()` },
  { label: 'custom_form_domains.backfill.id', sql: `UPDATE custom_form_domains SET id = md5(random()::text || clock_timestamp()::text) WHERE id IS NULL OR id = ''` },
  { label: 'custom_form_domains.id.not_null', sql: `ALTER TABLE custom_form_domains ALTER COLUMN id SET NOT NULL` },
  { label: 'custom_form_domains.domain.unique', sql: `CREATE UNIQUE INDEX IF NOT EXISTS custom_form_domains_domain_key ON custom_form_domains(domain)` },
  { label: 'custom_form_domains.tenant.index', sql: `CREATE INDEX IF NOT EXISTS custom_form_domains_tenant_id_idx ON custom_form_domains(tenant_id)` },
  { label: 'custom_form_domains.domain.index', sql: `CREATE INDEX IF NOT EXISTS custom_form_domains_domain_idx ON custom_form_domains(domain)` },
  { label: 'custom_form_domains.status.index', sql: `CREATE INDEX IF NOT EXISTS custom_form_domains_status_idx ON custom_form_domains(status)` },
  { label: 'custom_form_domains.verification_status.index', sql: `CREATE INDEX IF NOT EXISTS custom_form_domains_verification_status_idx ON custom_form_domains(verification_status)` },
  { label: 'custom_form_domains.tenant_primary.index', sql: `CREATE INDEX IF NOT EXISTS custom_form_domains_tenant_id_is_primary_idx ON custom_form_domains(tenant_id, is_primary)` },
  { label: 'custom_form_domains.one_primary_per_tenant.unique', sql: `CREATE UNIQUE INDEX IF NOT EXISTS custom_form_domains_one_primary_per_tenant_idx ON custom_form_domains(tenant_id) WHERE is_primary = true` },
  {
    label: 'custom_form_domains.tenant_id.fkey',
    sql: `DO $$
BEGIN
  IF to_regclass('public.tenants') IS NOT NULL
     AND to_regclass('public.custom_form_domains') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'custom_form_domains_tenant_id_fkey'
         AND conrelid = 'public.custom_form_domains'::regclass
     )
  THEN
    ALTER TABLE public.custom_form_domains
    ADD CONSTRAINT custom_form_domains_tenant_id_fkey
    FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id)
    ON DELETE CASCADE;
  END IF;
END $$;`,
  },
];


steps.push(

  { label: 'lead_assignment_rotations.table', sql: `CREATE TABLE IF NOT EXISTS public.lead_assignment_rotations (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, form_id TEXT NOT NULL, is_enabled BOOLEAN NOT NULL DEFAULT FALSE, strategy TEXT NOT NULL DEFAULT 'round_robin', last_assigned_to TEXT, current_index INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)` },
  { label: 'lead_assignment_rotation_members.table', sql: `CREATE TABLE IF NOT EXISTS public.lead_assignment_rotation_members (id TEXT PRIMARY KEY, rotation_id TEXT NOT NULL, user_id TEXT NOT NULL, order_index INTEGER NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)` },
  { label: 'lead_assignment_rotations.indexes', sql: `CREATE INDEX IF NOT EXISTS lead_assignment_rotations_tenant_id_idx ON public.lead_assignment_rotations(tenant_id); CREATE INDEX IF NOT EXISTS lead_assignment_rotations_form_id_idx ON public.lead_assignment_rotations(form_id);` },
  { label: 'lead_assignment_rotation_members.indexes', sql: `CREATE INDEX IF NOT EXISTS lead_assignment_rotation_members_rotation_id_idx ON public.lead_assignment_rotation_members(rotation_id); CREATE INDEX IF NOT EXISTS lead_assignment_rotation_members_user_id_idx ON public.lead_assignment_rotation_members(user_id); CREATE INDEX IF NOT EXISTS lead_assignment_rotation_members_rotation_order_idx ON public.lead_assignment_rotation_members(rotation_id, order_index);` },
  { label: 'lead_assignment_rotation.fkeys', sql: `DO $$ BEGIN IF to_regclass('public.tenants') IS NOT NULL AND to_regclass('public.lead_assignment_rotations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_assignment_rotations_tenant_id_fkey') THEN ALTER TABLE public.lead_assignment_rotations ADD CONSTRAINT lead_assignment_rotations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE; END IF; IF to_regclass('public.forms') IS NOT NULL AND to_regclass('public.lead_assignment_rotations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_assignment_rotations_form_id_fkey') THEN ALTER TABLE public.lead_assignment_rotations ADD CONSTRAINT lead_assignment_rotations_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE; END IF; IF to_regclass('public.lead_assignment_rotations') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_assignment_rotations_tenant_form_unique') THEN ALTER TABLE public.lead_assignment_rotations ADD CONSTRAINT lead_assignment_rotations_tenant_form_unique UNIQUE (tenant_id, form_id); END IF; IF to_regclass('public.lead_assignment_rotations') IS NOT NULL AND to_regclass('public.lead_assignment_rotation_members') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_assignment_rotation_members_rotation_id_fkey') THEN ALTER TABLE public.lead_assignment_rotation_members ADD CONSTRAINT lead_assignment_rotation_members_rotation_id_fkey FOREIGN KEY (rotation_id) REFERENCES public.lead_assignment_rotations(id) ON DELETE CASCADE; END IF; IF to_regclass('public.users') IS NOT NULL AND to_regclass('public.lead_assignment_rotation_members') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_assignment_rotation_members_user_id_fkey') THEN ALTER TABLE public.lead_assignment_rotation_members ADD CONSTRAINT lead_assignment_rotation_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE; END IF; IF to_regclass('public.lead_assignment_rotation_members') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_assignment_rotation_members_rotation_user_unique') THEN ALTER TABLE public.lead_assignment_rotation_members ADD CONSTRAINT lead_assignment_rotation_members_rotation_user_unique UNIQUE (rotation_id, user_id); END IF; END $$;` },
  { label: 'lead_purchases.table', sql: `CREATE TABLE IF NOT EXISTS public.lead_purchases (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, lead_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'BRL', purchase_date TIMESTAMP(3) NOT NULL, order_number TEXT, payment_method TEXT, notes TEXT, created_by TEXT, updated_by TEXT, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)` },
  { label: 'lead_purchases.id', sql: `ALTER TABLE public.lead_purchases ADD COLUMN IF NOT EXISTS id TEXT` },
  { label: 'lead_purchases.tenant_id', sql: `ALTER TABLE public.lead_purchases ADD COLUMN IF NOT EXISTS tenant_id TEXT` },
  { label: 'lead_purchases.lead_id', sql: `ALTER TABLE public.lead_purchases ADD COLUMN IF NOT EXISTS lead_id TEXT` },
  { label: 'lead_purchases.amount_cents', sql: `ALTER TABLE public.lead_purchases ADD COLUMN IF NOT EXISTS amount_cents INTEGER` },
  { label: 'lead_purchases.currency', sql: `ALTER TABLE public.lead_purchases ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL'` },
  { label: 'lead_purchases.purchase_date', sql: `ALTER TABLE public.lead_purchases ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMP(3)` },
  { label: 'lead_purchases.order_number', sql: `ALTER TABLE public.lead_purchases ADD COLUMN IF NOT EXISTS order_number TEXT` },
  { label: 'lead_purchases.payment_method', sql: `ALTER TABLE public.lead_purchases ADD COLUMN IF NOT EXISTS payment_method TEXT` },
  { label: 'lead_purchases.notes', sql: `ALTER TABLE public.lead_purchases ADD COLUMN IF NOT EXISTS notes TEXT` },
  { label: 'lead_purchases.created_by', sql: `ALTER TABLE public.lead_purchases ADD COLUMN IF NOT EXISTS created_by TEXT` },
  { label: 'lead_purchases.updated_by', sql: `ALTER TABLE public.lead_purchases ADD COLUMN IF NOT EXISTS updated_by TEXT` },
  { label: 'lead_purchases.created_at', sql: `ALTER TABLE public.lead_purchases ADD COLUMN IF NOT EXISTS created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` },
  { label: 'lead_purchases.updated_at', sql: `ALTER TABLE public.lead_purchases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` },
  { label: 'lead_purchases.tenant.index', sql: `CREATE INDEX IF NOT EXISTS lead_purchases_tenant_id_idx ON public.lead_purchases(tenant_id)` },
  { label: 'lead_purchases.lead.index', sql: `CREATE INDEX IF NOT EXISTS lead_purchases_lead_id_idx ON public.lead_purchases(lead_id)` },
  { label: 'lead_purchases.tenant_date.index', sql: `CREATE INDEX IF NOT EXISTS lead_purchases_tenant_purchase_date_idx ON public.lead_purchases(tenant_id, purchase_date)` },
  { label: 'lead_purchases.tenant_lead_date.index', sql: `CREATE INDEX IF NOT EXISTS lead_purchases_tenant_lead_purchase_date_idx ON public.lead_purchases(tenant_id, lead_id, purchase_date)` },
  { label: 'lead_purchases.fkeys', sql: `DO $$ BEGIN IF to_regclass('public.tenants') IS NOT NULL AND to_regclass('public.lead_purchases') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_purchases_tenant_id_fkey') THEN ALTER TABLE public.lead_purchases ADD CONSTRAINT lead_purchases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE; END IF; IF to_regclass('public.leads') IS NOT NULL AND to_regclass('public.lead_purchases') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_purchases_lead_id_fkey') THEN ALTER TABLE public.lead_purchases ADD CONSTRAINT lead_purchases_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE; END IF; END $$;` }
);

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
