-- Create tenant integration and tracking tables before additive repair migrations run.
CREATE TABLE IF NOT EXISTS tenant_integration_settings (
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
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kanban_stage_tracking_events (
  id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  tenant_id TEXT NOT NULL,
  pipeline_id TEXT,
  stage_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  event_name TEXT NOT NULL,
  custom_event_name TEXT,
  conversion_label TEXT,
  conversion_value DECIMAL(10, 2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  metadata JSONB,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracking_event_logs (
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
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE tenant_integration_settings
  ADD COLUMN IF NOT EXISTS id TEXT DEFAULT md5(random()::text || clock_timestamp()::text),
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_pixel_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_access_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS meta_test_event_code TEXT,
  ADD COLUMN IF NOT EXISTS gtm_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gtm_container_id TEXT,
  ADD COLUMN IF NOT EXISTS ga4_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ga4_measurement_id TEXT,
  ADD COLUMN IF NOT EXISTS ga4_api_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS google_ads_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_ads_id TEXT,
  ADD COLUMN IF NOT EXISTS google_ads_label TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();

ALTER TABLE kanban_stage_tracking_events
  ADD COLUMN IF NOT EXISTS id TEXT DEFAULT md5(random()::text || clock_timestamp()::text),
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS pipeline_id TEXT,
  ADD COLUMN IF NOT EXISTS stage_id TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS event_name TEXT,
  ADD COLUMN IF NOT EXISTS custom_event_name TEXT,
  ADD COLUMN IF NOT EXISTS conversion_label TEXT,
  ADD COLUMN IF NOT EXISTS conversion_value DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();

ALTER TABLE tracking_event_logs
  ADD COLUMN IF NOT EXISTS id TEXT DEFAULT md5(random()::text || clock_timestamp()::text),
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS lead_id TEXT,
  ADD COLUMN IF NOT EXISTS pipeline_id TEXT,
  ADD COLUMN IF NOT EXISTS from_stage_id TEXT,
  ADD COLUMN IF NOT EXISTS to_stage_id TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS event_name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS triggered_by_id TEXT,
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS tenant_integration_settings_tenant_id_key
  ON tenant_integration_settings(tenant_id);
CREATE INDEX IF NOT EXISTS tenant_integration_settings_tenant_id_idx
  ON tenant_integration_settings(tenant_id);
CREATE INDEX IF NOT EXISTS kanban_stage_tracking_events_tenant_id_idx
  ON kanban_stage_tracking_events(tenant_id);
CREATE INDEX IF NOT EXISTS kanban_stage_tracking_events_stage_id_idx
  ON kanban_stage_tracking_events(stage_id);
CREATE INDEX IF NOT EXISTS kanban_stage_tracking_events_tenant_stage_provider_idx
  ON kanban_stage_tracking_events(tenant_id, stage_id, provider);
CREATE INDEX IF NOT EXISTS tracking_event_logs_tenant_id_idx
  ON tracking_event_logs(tenant_id);
CREATE INDEX IF NOT EXISTS tracking_event_logs_lead_id_idx
  ON tracking_event_logs(lead_id);
CREATE INDEX IF NOT EXISTS tracking_event_logs_created_at_idx
  ON tracking_event_logs(created_at);
CREATE INDEX IF NOT EXISTS tracking_event_logs_tenant_provider_created_at_idx
  ON tracking_event_logs(tenant_id, provider, created_at);
