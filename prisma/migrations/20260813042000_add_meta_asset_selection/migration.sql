ALTER TABLE "tenant_meta_connections"
  ADD COLUMN "meta_business_id" TEXT,
  ADD COLUMN "meta_business_name" TEXT,
  ADD COLUMN "meta_ad_account_id" TEXT,
  ADD COLUMN "meta_ad_account_name" TEXT,
  ADD COLUMN "meta_pixel_id" TEXT,
  ADD COLUMN "meta_pixel_name" TEXT,
  ADD COLUMN "assets_selected_at" TIMESTAMP(3);
