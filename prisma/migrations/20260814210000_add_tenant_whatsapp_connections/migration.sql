-- Additive WhatsApp Embedded Signup foundation.
-- No existing customer records are modified or deleted.
ALTER TABLE "platform_meta_settings"
  ADD COLUMN "whatsapp_embedded_signup_config_id" TEXT,
  ADD COLUMN "whatsapp_business_id" TEXT,
  ADD COLUMN "whatsapp_system_user_id" TEXT,
  ADD COLUMN "whatsapp_admin_system_user_access_token_encrypted" TEXT,
  ADD COLUMN "whatsapp_system_user_access_token_encrypted" TEXT;

CREATE TABLE "tenant_whatsapp_connections" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'connected',
  "waba_id" TEXT NOT NULL,
  "waba_name" TEXT,
  "phone_number_id" TEXT NOT NULL,
  "display_phone_number" TEXT,
  "verified_name" TEXT,
  "quality_rating" TEXT,
  "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "system_user_assigned_at" TIMESTAMP(3),
  "subscribed_at" TIMESTAMP(3),
  "last_validated_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_whatsapp_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_whatsapp_connections_waba_id_key"
  ON "tenant_whatsapp_connections"("waba_id");
CREATE UNIQUE INDEX "tenant_whatsapp_connections_phone_number_id_key"
  ON "tenant_whatsapp_connections"("phone_number_id");
CREATE INDEX "tenant_whatsapp_connections_tenant_id_idx"
  ON "tenant_whatsapp_connections"("tenant_id");
CREATE INDEX "tenant_whatsapp_connections_tenant_id_status_idx"
  ON "tenant_whatsapp_connections"("tenant_id", "status");

ALTER TABLE "tenant_whatsapp_connections"
  ADD CONSTRAINT "tenant_whatsapp_connections_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
