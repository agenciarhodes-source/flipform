-- The owner can switch off the Flip's daily summary for the whole company.
-- Additive only: starts on, so nothing changes until the owner switches it off.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "flip_briefing_enabled" BOOLEAN NOT NULL DEFAULT true;
