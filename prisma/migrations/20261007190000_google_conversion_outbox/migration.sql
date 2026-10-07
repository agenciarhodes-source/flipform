-- Google Ads Funnel: conversion mapping and event outbox.
-- Additive only: two new tables, no change to existing tables or data.
-- Apply manually through the controlled production runbook.
CREATE TABLE "google_conversion_mappings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "pipeline_id" TEXT NOT NULL,
  "stage_id" TEXT NOT NULL,
  "conversion_action_resource" TEXT NOT NULL,
  "conversion_action_name" TEXT,
  "conversion_category" TEXT NOT NULL,
  "optimization_role" TEXT NOT NULL DEFAULT 'secondary',
  "value_mode" TEXT NOT NULL DEFAULT 'none',
  "conversion_value" DECIMAL(10,2),
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "trigger_rule" TEXT NOT NULL DEFAULT 'first_entry',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "archived_at" TIMESTAMP(3),
  "created_by_id" TEXT,
  "updated_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "google_conversion_mappings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "google_conversion_mappings_category_check"
    CHECK ("conversion_category" IN ('lead', 'qualified_lead', 'converted_lead')),
  CONSTRAINT "google_conversion_mappings_role_check"
    CHECK ("optimization_role" IN ('primary', 'secondary')),
  CONSTRAINT "google_conversion_mappings_value_mode_check"
    CHECK ("value_mode" IN ('none', 'fixed', 'purchase')),
  CONSTRAINT "google_conversion_mappings_trigger_rule_check"
    CHECK ("trigger_rule" IN ('first_entry', 'every_entry')),
  CONSTRAINT "google_conversion_mappings_value_check"
    CHECK (("value_mode" = 'fixed' AND "conversion_value" > 0) OR ("value_mode" <> 'fixed' AND "conversion_value" IS NULL)),
  CONSTRAINT "google_conversion_mappings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "google_conversion_mappings_tenant_id_id_key"
  ON "google_conversion_mappings"("tenant_id", "id");

CREATE UNIQUE INDEX "google_conversion_mappings_tenant_stage_action_key"
  ON "google_conversion_mappings"("tenant_id", "stage_id", "conversion_action_resource");

CREATE INDEX "google_conversion_mappings_tenant_id_pipeline_id_idx"
  ON "google_conversion_mappings"("tenant_id", "pipeline_id");

CREATE INDEX "google_conversion_mappings_tenant_id_stage_id_enabled_idx"
  ON "google_conversion_mappings"("tenant_id", "stage_id", "enabled");

CREATE TABLE "google_conversion_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "mapping_id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "pipeline_id" TEXT NOT NULL,
  "stage_id" TEXT NOT NULL,
  "transition_id" TEXT NOT NULL,
  "conversion_action_resource" TEXT NOT NULL,
  "conversion_category" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "conversion_time" TIMESTAMP(3) NOT NULL,
  "conversion_value" DECIMAL(10,2),
  "currency" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3),
  "last_attempt_at" TIMESTAMP(3),
  "last_error_code" TEXT,
  "finalized_at" TIMESTAMP(3),
  "triggered_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "google_conversion_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "google_conversion_events_state_check"
    CHECK ("state" IN ('PENDING', 'SENT', 'ACCEPTED', 'REJECTED', 'RETRY', 'FAILED')),
  CONSTRAINT "google_conversion_events_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "google_conversion_events_value_check"
    CHECK ("conversion_value" IS NULL OR "conversion_value" > 0),
  CONSTRAINT "google_conversion_events_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "google_conversion_events_tenant_id_mapping_id_fkey"
    FOREIGN KEY ("tenant_id", "mapping_id")
    REFERENCES "google_conversion_mappings"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "google_conversion_events_tenant_id_idempotency_key_key"
  ON "google_conversion_events"("tenant_id", "idempotency_key");

CREATE INDEX "google_conversion_events_state_next_attempt_at_idx"
  ON "google_conversion_events"("state", "next_attempt_at");

CREATE INDEX "google_conversion_events_tenant_id_lead_id_idx"
  ON "google_conversion_events"("tenant_id", "lead_id");

CREATE INDEX "google_conversion_events_tenant_id_mapping_id_state_idx"
  ON "google_conversion_events"("tenant_id", "mapping_id", "state");

CREATE INDEX "google_conversion_events_tenant_id_created_at_idx"
  ON "google_conversion_events"("tenant_id", "created_at");
