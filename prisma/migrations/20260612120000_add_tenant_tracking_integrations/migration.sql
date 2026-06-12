-- Add secure integration credentials and per-stage conversion metadata.
ALTER TABLE tenant_integration_settings
  ADD COLUMN IF NOT EXISTS meta_access_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS meta_test_event_code TEXT,
  ADD COLUMN IF NOT EXISTS ga4_api_secret_encrypted TEXT;

ALTER TABLE kanban_stage_tracking_events
  ADD COLUMN IF NOT EXISTS conversion_label TEXT,
  ADD COLUMN IF NOT EXISTS conversion_value DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS kanban_stage_tracking_events_tenant_stage_provider_idx
  ON kanban_stage_tracking_events(tenant_id, stage_id, provider);

CREATE INDEX IF NOT EXISTS tracking_event_logs_tenant_provider_created_at_idx
  ON tracking_event_logs(tenant_id, provider, created_at);
