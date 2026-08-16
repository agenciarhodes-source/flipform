ALTER TABLE "platform_meta_settings"
    ADD COLUMN "instagram_app_id" TEXT,
    ADD COLUMN "instagram_app_secret_encrypted" TEXT;

CREATE TABLE "tenant_instagram_connections" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "instagram_user_id" TEXT NOT NULL,
    "username" TEXT,
    "access_token_encrypted" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "connected_by_id" TEXT,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_validated_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_instagram_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_instagram_connections_instagram_user_id_key"
    ON "tenant_instagram_connections"("instagram_user_id");

CREATE INDEX "tenant_instagram_connections_tenant_id_idx"
    ON "tenant_instagram_connections"("tenant_id");

CREATE INDEX "tenant_instagram_connections_tenant_id_status_idx"
    ON "tenant_instagram_connections"("tenant_id", "status");

CREATE INDEX "tenant_instagram_connections_connected_by_id_idx"
    ON "tenant_instagram_connections"("connected_by_id");

ALTER TABLE "tenant_instagram_connections"
    ADD CONSTRAINT "tenant_instagram_connections_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_instagram_connections"
    ADD CONSTRAINT "tenant_instagram_connections_connected_by_id_fkey"
    FOREIGN KEY ("connected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
