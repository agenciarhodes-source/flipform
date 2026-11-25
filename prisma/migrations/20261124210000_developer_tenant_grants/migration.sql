-- Additive, not executed by this PR. Technical developer privileges are denied until
-- explicit per-tenant grants, required MFA and API guards have been deployed.
CREATE TABLE "developer_tenant_grants" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "granted_by_id" TEXT NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "developer_tenant_grants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "developer_tenant_grants_tenant_id_user_id_key"
  ON "developer_tenant_grants"("tenant_id","user_id");
CREATE INDEX "developer_tenant_grants_user_id_revoked_at_idx"
  ON "developer_tenant_grants"("user_id","revoked_at");
ALTER TABLE "developer_tenant_grants" ADD CONSTRAINT "developer_tenant_grants_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "developer_tenant_grants" ADD CONSTRAINT "developer_tenant_grants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "developer_tenant_grants" ADD CONSTRAINT "developer_tenant_grants_granted_by_id_fkey"
  FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
