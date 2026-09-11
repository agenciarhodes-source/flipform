-- Additive PR #273. Review and apply manually on an isolated Neon branch first.
-- Never run prisma migrate deploy against production.
ALTER TABLE "flip_ai_agents"
  ADD COLUMN "rotation_id" TEXT;

ALTER TABLE "flip_ai_agents"
  ADD CONSTRAINT "flip_ai_agents_rotation_id_fkey"
  FOREIGN KEY ("rotation_id") REFERENCES "lead_assignment_rotations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "flip_ai_agents_tenant_id_rotation_id_idx"
  ON "flip_ai_agents"("tenant_id", "rotation_id");
