-- Security protocol S3: limits of tries (login, codes, forms, chat) shared by every server.
-- Additive only: one new table. Keys are stored as SHA-256 hashes, never as e-mail or IP.
CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "key_hash" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "reset_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key_hash")
);
CREATE INDEX IF NOT EXISTS "rate_limit_buckets_reset_at_idx" ON "rate_limit_buckets"("reset_at");
