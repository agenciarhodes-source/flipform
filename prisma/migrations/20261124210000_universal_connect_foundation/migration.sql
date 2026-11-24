-- PR-A additive only. Review target, backup, retention and rollback before applying.
CREATE TABLE "universal_connections" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "auth_method" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "universal_connections_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "universal_connection_credentials" (
    "tenant_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "universal_connection_credentials_pkey" PRIMARY KEY ("tenant_id", "connection_id")
);
CREATE TABLE "universal_connection_audits" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "universal_connection_audits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "universal_connections_tenant_id_id_key" ON "universal_connections"("tenant_id", "id");
CREATE INDEX "universal_connections_tenant_id_provider_id_idx" ON "universal_connections"("tenant_id", "provider_id");
CREATE INDEX "universal_connection_audits_tenant_id_connection_id_created_at_idx" ON "universal_connection_audits"("tenant_id", "connection_id", "created_at");
ALTER TABLE "universal_connections" ADD CONSTRAINT "universal_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "universal_connection_credentials" ADD CONSTRAINT "universal_connection_credentials_tenant_id_connection_id_fkey" FOREIGN KEY ("tenant_id", "connection_id") REFERENCES "universal_connections"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "universal_connection_audits" ADD CONSTRAINT "universal_connection_audits_tenant_id_connection_id_fkey" FOREIGN KEY ("tenant_id", "connection_id") REFERENCES "universal_connections"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
