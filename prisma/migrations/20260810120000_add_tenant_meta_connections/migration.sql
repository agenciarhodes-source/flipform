CREATE TYPE "TenantMetaConnectionStatus" AS ENUM ('authorized', 'revoked', 'expired', 'error');

CREATE TABLE "tenant_meta_connections" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "status" "TenantMetaConnectionStatus" NOT NULL,
  "meta_user_id" TEXT NOT NULL,
  "meta_user_name" TEXT,
  "access_token_encrypted" TEXT NOT NULL,
  "token_expires_at" TIMESTAMP(3),
  "granted_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "connected_by_id" TEXT,
  "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_validated_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_meta_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_meta_connections_tenant_id_meta_user_id_key" ON "tenant_meta_connections"("tenant_id", "meta_user_id");
CREATE INDEX "tenant_meta_connections_tenant_id_idx" ON "tenant_meta_connections"("tenant_id");
CREATE INDEX "tenant_meta_connections_tenant_id_status_idx" ON "tenant_meta_connections"("tenant_id", "status");
CREATE INDEX "tenant_meta_connections_connected_by_id_idx" ON "tenant_meta_connections"("connected_by_id");
ALTER TABLE "tenant_meta_connections" ADD CONSTRAINT "tenant_meta_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_meta_connections" ADD CONSTRAINT "tenant_meta_connections_connected_by_id_fkey" FOREIGN KEY ("connected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
