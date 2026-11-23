-- PR629: five nullable columns only. No cleanup, TTL, backfill or FK changes.
-- DO NOT apply to Neon/production without explicit separate authorization.
ALTER TABLE "api_v1_integrations" ADD COLUMN IF NOT EXISTS "disabled_at" TIMESTAMP(3);
ALTER TABLE "api_v1_quota_buckets" ADD COLUMN IF NOT EXISTS "window_end" TIMESTAMP(3);
ALTER TABLE "api_v1_idempotency_records" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);
ALTER TABLE "api_v1_inbox_events" ADD COLUMN IF NOT EXISTS "finalized_at" TIMESTAMP(3);
ALTER TABLE "api_v1_outbox_events" ADD COLUMN IF NOT EXISTS "finalized_at" TIMESTAMP(3);
