-- Voice chosen for each attendant's audio replies.
-- Additive only: one new table, no existing table or data is changed.
-- Until it is applied every attendant uses the default voice.
CREATE TABLE "agent_speech_settings" (
  "agent_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "voice" TEXT NOT NULL,
  "updated_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_speech_settings_pkey" PRIMARY KEY ("agent_id")
);

CREATE INDEX "agent_speech_settings_tenant_id_idx" ON "agent_speech_settings"("tenant_id");
