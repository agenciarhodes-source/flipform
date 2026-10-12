-- When each attendant may answer in audio.
-- Additive only: one new column with a default on the attendant voice settings table.
ALTER TABLE "agent_speech_settings"
  ADD COLUMN "audio_mode" TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE "agent_speech_settings"
  ADD CONSTRAINT "agent_speech_settings_audio_mode_check"
  CHECK ("audio_mode" IN ('never', 'on_request', 'auto'));
