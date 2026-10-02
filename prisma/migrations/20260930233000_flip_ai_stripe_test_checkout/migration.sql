ALTER TABLE "flip_ai_top_up_orders"
  ADD COLUMN "stripe_checkout_session_id" TEXT,
  ADD COLUMN "stripe_checkout_attempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stripe_checkout_requested_at" TIMESTAMP(3),
  ADD COLUMN "stripe_checkout_created_at" TIMESTAMP(3),
  ADD COLUMN "stripe_checkout_expires_at" TIMESTAMP(3);

ALTER TABLE "flip_ai_top_up_orders"
  ADD CONSTRAINT "flip_ai_top_up_orders_checkout_attempt_check"
  CHECK ("stripe_checkout_attempt" >= 0);

CREATE UNIQUE INDEX "flip_ai_top_up_orders_stripe_checkout_session_id_key"
  ON "flip_ai_top_up_orders"("stripe_checkout_session_id");
