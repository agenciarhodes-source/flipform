-- The Flip's daily summary per person, made once a day. Additive only: one new table.
CREATE TABLE IF NOT EXISTS "flip_daily_briefings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "generated_by" TEXT NOT NULL DEFAULT 'ai',
  "seen_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flip_daily_briefings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_daily_briefings_tenant_id_user_id_day_key" UNIQUE ("tenant_id", "user_id", "day"),
  CONSTRAINT "flip_daily_briefings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "flip_daily_briefings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
