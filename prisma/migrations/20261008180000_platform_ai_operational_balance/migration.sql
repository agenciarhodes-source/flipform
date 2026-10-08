-- Manual reference of the provider prepaid balance, edited in the Treasury panel.
-- Additive only: two nullable columns on the platform settings table.
-- Until applied, the application keeps reading OPENAI_OPERATIONAL_BALANCE_USD.
ALTER TABLE "platform_flip_ai_settings"
  ADD COLUMN "operational_balance_usd" DECIMAL(12,2),
  ADD COLUMN "operational_balance_updated_at" TIMESTAMP(3);

ALTER TABLE "platform_flip_ai_settings"
  ADD CONSTRAINT "platform_flip_ai_settings_operational_balance_check"
  CHECK ("operational_balance_usd" IS NULL OR "operational_balance_usd" >= 0);
