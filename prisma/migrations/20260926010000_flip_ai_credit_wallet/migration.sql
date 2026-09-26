CREATE TABLE "flip_ai_credit_accounts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "balance_credits" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "flip_ai_credit_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_ai_credit_accounts_balance_check" CHECK ("balance_credits" >= 0),
  CONSTRAINT "flip_ai_credit_accounts_version_check" CHECK ("version" >= 1),
  CONSTRAINT "flip_ai_credit_accounts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "flip_ai_credit_accounts_tenant_id_key"
  ON "flip_ai_credit_accounts"("tenant_id");

CREATE UNIQUE INDEX "flip_ai_credit_accounts_tenant_id_id_key"
  ON "flip_ai_credit_accounts"("tenant_id", "id");

CREATE TABLE "flip_ai_credit_ledger" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "entry_type" TEXT NOT NULL,
  "amount_credits" INTEGER NOT NULL,
  "balance_after_credits" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "reference_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flip_ai_credit_ledger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_ai_credit_ledger_entry_type_check"
    CHECK ("entry_type" IN ('credit', 'debit', 'refund')),
  CONSTRAINT "flip_ai_credit_ledger_amount_check" CHECK ("amount_credits" > 0),
  CONSTRAINT "flip_ai_credit_ledger_balance_after_check" CHECK ("balance_after_credits" >= 0),
  CONSTRAINT "flip_ai_credit_ledger_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "flip_ai_credit_ledger_tenant_id_account_id_fkey"
    FOREIGN KEY ("tenant_id", "account_id")
    REFERENCES "flip_ai_credit_accounts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "flip_ai_credit_ledger_tenant_id_idempotency_key_key"
  ON "flip_ai_credit_ledger"("tenant_id", "idempotency_key");

CREATE INDEX "flip_ai_credit_ledger_tenant_id_created_at_idx"
  ON "flip_ai_credit_ledger"("tenant_id", "created_at");

CREATE INDEX "flip_ai_credit_ledger_tenant_id_account_id_created_at_idx"
  ON "flip_ai_credit_ledger"("tenant_id", "account_id", "created_at");

