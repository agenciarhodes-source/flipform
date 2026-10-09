-- Manual control of provider recharges per credit purchase (Treasury panel).
-- Additive only: one new table, no existing table or data is changed.
-- Until it is applied the list of purchases still works, without the funded mark.
CREATE TABLE "platform_top_up_funding" (
  "order_id" TEXT NOT NULL,
  "funded_usd" DECIMAL(12,2) NOT NULL,
  "funded_at" TIMESTAMP(3) NOT NULL,
  "funded_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_top_up_funding_pkey" PRIMARY KEY ("order_id"),
  CONSTRAINT "platform_top_up_funding_funded_usd_check" CHECK ("funded_usd" >= 0)
);
