-- Attendant profile of each Flip AI attendant: "analyst" (triage only, then hands off to the team)
-- or "closer" (triage, next step and close). Additive only: one new table, no link to flip_ai_ tables.
-- An attendant without a row works as "closer".
CREATE TABLE IF NOT EXISTS "ai_attendant_profiles" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'closer',
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_attendant_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_attendant_profiles_role_check" CHECK ("role" IN ('analyst', 'closer')),
  CONSTRAINT "ai_attendant_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ai_attendant_profiles_agent_id_key" ON "ai_attendant_profiles"("agent_id");
CREATE INDEX IF NOT EXISTS "ai_attendant_profiles_tenant_id_idx" ON "ai_attendant_profiles"("tenant_id");
