ALTER TABLE tenant_integration_settings
  ADD COLUMN IF NOT EXISTS whatsapp_funnel_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS whatsapp_event_triggers (
  id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  trigger_phrase TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'exact',
  provider TEXT NOT NULL DEFAULT 'meta',
  event_name TEXT NOT NULL,
  custom_event_name TEXT,
  conversion_value NUMERIC(10, 2),
  currency TEXT NOT NULL DEFAULT 'BRL',
  pipeline_id TEXT,
  stage_id TEXT,
  once_per_lead BOOLEAN NOT NULL DEFAULT true,
  require_exact_match BOOLEAN NOT NULL DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_event_triggers
  ADD CONSTRAINT whatsapp_event_triggers_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_event_triggers_tenant_phrase_match_key
  ON whatsapp_event_triggers(tenant_id, trigger_phrase, match_type);
CREATE INDEX IF NOT EXISTS whatsapp_event_triggers_tenant_id_idx ON whatsapp_event_triggers(tenant_id);
CREATE INDEX IF NOT EXISTS whatsapp_event_triggers_tenant_enabled_order_idx ON whatsapp_event_triggers(tenant_id, enabled, order_index);
CREATE INDEX IF NOT EXISTS whatsapp_event_triggers_pipeline_id_idx ON whatsapp_event_triggers(pipeline_id);
CREATE INDEX IF NOT EXISTS whatsapp_event_triggers_stage_id_idx ON whatsapp_event_triggers(stage_id);

ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS conversation_id TEXT;
ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS trigger_rule_id TEXT;
ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS message_direction TEXT;
ALTER TABLE tracking_event_logs ADD COLUMN IF NOT EXISTS source TEXT;
CREATE INDEX IF NOT EXISTS tracking_event_logs_tenant_trigger_rule_event_idx ON tracking_event_logs(tenant_id, trigger_rule_id, event_name);
CREATE INDEX IF NOT EXISTS tracking_event_logs_tenant_conversation_idx ON tracking_event_logs(tenant_id, conversation_id);
