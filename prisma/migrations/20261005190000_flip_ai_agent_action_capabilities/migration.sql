-- Flip AI agent action capabilities (PR 347)
-- Additive only. Apply manually through the controlled production runbook.
-- Existing agents fail closed with no presencial/action capability enabled.
ALTER TABLE "flip_ai_agents"
  ADD COLUMN "action_capabilities" JSONB NOT NULL DEFAULT '{}'::jsonb;
