-- Platform-wide Flip AI settings (active text model chosen by the platform admin).
-- Additive only: one new table, no existing table or data is changed.
-- Until it is applied the application keeps using the default model.
CREATE TABLE "platform_flip_ai_settings" (
  "id" TEXT NOT NULL,
  "text_model" TEXT NOT NULL,
  "updated_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_flip_ai_settings_pkey" PRIMARY KEY ("id")
);
