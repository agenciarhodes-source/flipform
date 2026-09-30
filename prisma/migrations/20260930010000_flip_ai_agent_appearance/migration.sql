-- Flip AI agent appearance (PR 321)
-- Additive only. Apply manually through the controlled production runbook.
ALTER TABLE "flip_ai_agents"
  ADD COLUMN "avatar_url" TEXT,
  ADD COLUMN "chat_background_color" TEXT,
  ADD COLUMN "user_message_color" TEXT,
  ADD COLUMN "send_button_color" TEXT;

