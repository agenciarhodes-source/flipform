-- The customer's CPF on the lead, encrypted and in its own table. Additive only: one new table;
-- the leads table is not changed. Removing a lead removes its CPF (ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS "lead_personal_documents" (
  "lead_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "cpf_encrypted" TEXT NOT NULL,
  "cpf_hash" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_personal_documents_pkey" PRIMARY KEY ("lead_id"),
  CONSTRAINT "lead_personal_documents_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lead_personal_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lead_personal_documents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "lead_personal_documents_tenant_id_cpf_hash_idx" ON "lead_personal_documents"("tenant_id", "cpf_hash");
