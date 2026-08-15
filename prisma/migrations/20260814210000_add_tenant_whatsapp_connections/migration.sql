-- Additive WhatsApp Embedded Signup foundation.
-- No existing customer records are modified or deleted.
ALTER TABLE "platform_meta_settings"
  ADD COLUMN "whatsapp_embedded_signup_config_id" TEXT;

CREATE TABLE "tenant_whatsapp_connections" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'connected',
  "access_token_encrypted" TEXT NOT NULL,
  "token_expires_at" TIMESTAMP(3),
  "granted_scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "waba_id" TEXT NOT NULL,
  "waba_name" TEXT,
  "phone_number_id" TEXT NOT NULL,
  "display_phone_number" TEXT,
  "verified_name" TEXT,
  "quality_rating" TEXT,
  "code_verification_status" TEXT,
  "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
