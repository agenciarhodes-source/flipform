-- Flip Voice Core (FV01): additive schema, all tenant flags OFF by default.
-- NEVER deploy this migration automatically with the draft PR.
-- No lead/message content, audio samples, transcript, secrets, or raw phone numbers.
CREATE TABLE "flip_voice_settings" (
 "tenant_id" TEXT NOT NULL,
 "enabled" BOOLEAN NOT NULL DEFAULT false,
 "outbound_enabled" BOOLEAN NOT NULL DEFAULT false,
 "recording_enabled" BOOLEAN NOT NULL DEFAULT false,
 "monthly_limit_micros" BIGINT NOT NULL DEFAULT 0,
 "per_call_limit_micros" BIGINT NOT NULL DEFAULT 0,
 "max_call_seconds" INTEGER NOT NULL DEFAULT 180,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "flip_voice_settings_pkey" PRIMARY KEY ("tenant_id"),
 CONSTRAINT "flip_voice_settings_cost_limits_check" CHECK ("monthly_limit_micros" >= 0 AND "per_call_limit_micros" >= 0 AND "max_call_seconds" BETWEEN 30 AND 3600)
);

CREATE TABLE "flip_voice_profiles" (
 "id" TEXT NOT NULL,
 "tenant_id" TEXT NOT NULL,
 "agent_id" TEXT,
 "label" TEXT NOT NULL,
 "provider" TEXT NOT NULL DEFAULT 'elevenlabs',
 "provider_voice_id" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending',
 "created_by" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "flip_voice_profiles_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "flip_voice_profiles_status_check" CHECK ("status" IN ('pending','active','revoked'))
);
CREATE UNIQUE INDEX "flip_voice_profiles_tenant_id_id_key" ON "flip_voice_profiles" ("tenant_id","id");
CREATE INDEX "flip_voice_profiles_tenant_id_agent_id_idx" ON "flip_voice_profiles" ("tenant_id","agent_id");
CREATE INDEX "flip_voice_profiles_tenant_id_status_idx" ON "flip_voice_profiles" ("tenant_id","status");

CREATE TABLE "flip_voice_consents" (
 "id" TEXT NOT NULL,
 "tenant_id" TEXT NOT NULL,
 "profile_id" TEXT NOT NULL,
 "evidence_sha256" TEXT NOT NULL,
 "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "status" TEXT NOT NULL DEFAULT 'pending',
 "verified_at" TIMESTAMP(3),
 "expires_at" TIMESTAMP(3),
 "revoked_at" TIMESTAMP(3),
 "authorized_by" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "flip_voice_consents_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "flip_voice_consents_status_check" CHECK ("status" IN ('pending','verified','revoked'))
);
CREATE UNIQUE INDEX "flip_voice_consents_tenant_id_profile_id_id_key" ON "flip_voice_consents" ("tenant_id","profile_id","id");
CREATE INDEX "flip_voice_consents_tenant_id_profile_id_status_idx" ON "flip_voice_consents" ("tenant_id","profile_id","status");

CREATE TABLE "flip_voice_budgets" (
 "tenant_id" TEXT NOT NULL,
 "period_start" TIMESTAMP(3) NOT NULL,
 "limit_micros" BIGINT NOT NULL DEFAULT 0,
 "reserved_micros" BIGINT NOT NULL DEFAULT 0,
 "spent_micros" BIGINT NOT NULL DEFAULT 0,
 "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "flip_voice_budgets_pkey" PRIMARY KEY ("tenant_id","period_start"),
 CONSTRAINT "flip_voice_budgets_nonnegative_check" CHECK ("limit_micros" >= 0 AND "reserved_micros" >= 0 AND "spent_micros" >= 0)
);

CREATE TABLE "flip_voice_calls" (
 "id" TEXT NOT NULL,
 "tenant_id" TEXT NOT NULL,
 "profile_id" TEXT NOT NULL,
 "consent_id" TEXT NOT NULL,
 "channel" TEXT NOT NULL,
 "direction" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'held',
 "contact_hash" TEXT,
 "request_key_hash" TEXT NOT NULL,
 "reserved_usd_micros" BIGINT NOT NULL DEFAULT 0,
 "billed_usd_micros" BIGINT NOT NULL DEFAULT 0,
 "provider_call_id" TEXT,
 "started_at" TIMESTAMP(3),
 "ended_at" TIMESTAMP(3),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "flip_voice_calls_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "flip_voice_calls_channel_check" CHECK ("channel" IN ('pstn','whatsapp')),
 CONSTRAINT "flip_voice_calls_direction_check" CHECK ("direction" IN ('inbound','outbound')),
 CONSTRAINT "flip_voice_calls_nonnegative_check" CHECK ("reserved_usd_micros" >= 0 AND "billed_usd_micros" >= 0)
);
CREATE UNIQUE INDEX "flip_voice_calls_tenant_id_id_key" ON "flip_voice_calls" ("tenant_id","id");
CREATE UNIQUE INDEX "flip_voice_calls_tenant_id_channel_direction_request_key_hash_key" ON "flip_voice_calls" ("tenant_id","channel","direction","request_key_hash");
CREATE INDEX "flip_voice_calls_tenant_id_status_created_at_idx" ON "flip_voice_calls" ("tenant_id","status","created_at");

CREATE TABLE "flip_voice_events" (
 "id" TEXT NOT NULL,
 "tenant_id" TEXT NOT NULL,
 "call_id" TEXT NOT NULL,
 "event_hash" TEXT NOT NULL,
 "event_type" TEXT NOT NULL,
 "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "flip_voice_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "flip_voice_events_tenant_id_call_id_event_hash_key" ON "flip_voice_events" ("tenant_id","call_id","event_hash");
CREATE INDEX "flip_voice_events_tenant_id_event_type_received_at_idx" ON "flip_voice_events" ("tenant_id","event_type","received_at");

ALTER TABLE "flip_voice_settings" ADD CONSTRAINT "flip_voice_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_voice_profiles" ADD CONSTRAINT "flip_voice_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_voice_profiles" ADD CONSTRAINT "flip_voice_profiles_tenant_id_agent_id_fkey" FOREIGN KEY ("tenant_id","agent_id") REFERENCES "flip_ai_agents"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_voice_consents" ADD CONSTRAINT "flip_voice_consents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_voice_consents" ADD CONSTRAINT "flip_voice_consents_tenant_id_profile_id_fkey" FOREIGN KEY ("tenant_id","profile_id") REFERENCES "flip_voice_profiles"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_voice_budgets" ADD CONSTRAINT "flip_voice_budgets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_voice_calls" ADD CONSTRAINT "flip_voice_calls_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_voice_calls" ADD CONSTRAINT "flip_voice_calls_tenant_id_profile_id_fkey" FOREIGN KEY ("tenant_id","profile_id") REFERENCES "flip_voice_profiles"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_voice_calls" ADD CONSTRAINT "flip_voice_calls_tenant_id_profile_id_consent_id_fkey" FOREIGN KEY ("tenant_id","profile_id","consent_id") REFERENCES "flip_voice_consents"("tenant_id","profile_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_voice_events" ADD CONSTRAINT "flip_voice_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_voice_events" ADD CONSTRAINT "flip_voice_events_tenant_id_call_id_fkey" FOREIGN KEY ("tenant_id","call_id") REFERENCES "flip_voice_calls"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
