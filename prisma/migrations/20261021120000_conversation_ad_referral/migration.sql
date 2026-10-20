-- The click-to-WhatsApp ad a conversation came from, so a qualified lead is credited to that ad.
-- Additive only: empty column, filled only by new conversations that come from an ad.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "ad_referral" JSONB;
