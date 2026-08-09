CREATE TABLE "platform_meta_settings" (
  "id" TEXT NOT NULL,
  "app_id" TEXT,
  "app_secret_encrypted" TEXT,
  "default_pixel_enabled" BOOLEAN NOT NULL DEFAULT true,
  "default_capi_enabled" BOOLEAN NOT NULL DEFAULT true,
  "default_advanced_matching_enabled" BOOLEAN NOT NULL DEFAULT true,
  "default_attribution_enabled" BOOLEAN NOT NULL DEFAULT true,
  "default_qualified_lead_enabled" BOOLEAN NOT NULL DEFAULT true,
  "default_purchase_enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_meta_settings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "platform_meta_settings_updated_by_id_idx" ON "platform_meta_settings"("updated_by_id");
ALTER TABLE "platform_meta_settings" ADD CONSTRAINT "platform_meta_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
