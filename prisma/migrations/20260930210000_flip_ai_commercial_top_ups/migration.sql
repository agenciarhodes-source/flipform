CREATE TABLE "flip_ai_top_up_orders" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "request_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "credits" INTEGER NOT NULL,
  "estimated_openai_cost_cents" INTEGER NOT NULL DEFAULT 0,
  "estimated_openai_cost_currency" TEXT NOT NULL DEFAULT 'USD',
  "payment_provider" TEXT,
  "provider_payment_id" TEXT,
  "payment_method" TEXT,
  "paid_at" TIMESTAMP(3),
  "credited_at" TIMESTAMP(3),
  "canceled_at" TIMESTAMP(3),
  "credit_ledger_entry_id" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "flip_ai_top_up_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_ai_top_up_orders_status_check"
    CHECK ("status" IN ('pending', 'paid', 'credited', 'canceled')),
  CONSTRAINT "flip_ai_top_up_orders_amount_cents_check" CHECK ("amount_cents" > 0),
  CONSTRAINT "flip_ai_top_up_orders_credits_check" CHECK ("credits" > 0),
  CONSTRAINT "flip_ai_top_up_orders_estimated_cost_check" CHECK ("estimated_openai_cost_cents" >= 0),
  CONSTRAINT "flip_ai_top_up_orders_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_top_up_orders_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "flip_ai_top_up_orders_tenant_id_id_key"
  ON "flip_ai_top_up_orders"("tenant_id", "id");

CREATE UNIQUE INDEX "flip_ai_top_up_orders_tenant_id_request_key_key"
  ON "flip_ai_top_up_orders"("tenant_id", "request_key");

CREATE UNIQUE INDEX "flip_ai_top_up_orders_payment_provider_provider_payment_id_key"
  ON "flip_ai_top_up_orders"("payment_provider", "provider_payment_id");

CREATE INDEX "flip_ai_top_up_orders_tenant_id_status_created_at_idx"
  ON "flip_ai_top_up_orders"("tenant_id", "status", "created_at");
