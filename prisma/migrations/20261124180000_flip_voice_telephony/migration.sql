-- PR2 Flip Voice: additive and disabled. No telephony APIs, data updates or production execution here.
CREATE TABLE "flip_voice_lines" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "phone_e164" TEXT NOT NULL,
  "provider_phone_number_id" TEXT NOT NULL,
  "provider_agent_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'disabled',
  "inbound_enabled" BOOLEAN NOT NULL DEFAULT false,
  "outbound_enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "flip_voice_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_voice_lines_status_check" CHECK ("status" IN ('disabled','ready','revoked')),
  CONSTRAINT "flip_voice_lines_phone_check" CHECK ("phone_e164" ~ '^\\+[1-9][0-9]{7,14}$')
);
CREATE UNIQUE INDEX "flip_voice_lines_provider_phone_number_id_key" ON "flip_voice_lines"("provider_phone_number_id");
CREATE UNIQUE INDEX "flip_voice_lines_tenant_id_id_key" ON "flip_voice_lines"("tenant_id","id");
CREATE UNIQUE INDEX "flip_voice_lines_tenant_id_phone_e164_key" ON "flip_voice_lines"("tenant_id","phone_e164");
CREATE INDEX "flip_voice_lines_tenant_id_status_idx" ON "flip_voice_lines"("tenant_id","status");

CREATE TABLE "flip_voice_contact_permissions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "phone_hash" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'pstn',
  "purpose" TEXT NOT NULL DEFAULT 'requested_follow_up',
  "evidence_sha256" TEXT NOT NULL,
  "verified_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flip_voice_contact_permissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flip_voice_contact_permissions_status_check" CHECK ("status" IN ('pending','verified','revoked')),
  CONSTRAINT "flip_voice_contact_permissions_channel_check" CHECK ("channel" IN ('pstn','whatsapp')),
  CONSTRAINT "flip_voice_contact_permissions_evidence_check" CHECK ("evidence_sha256" ~ '^[a-fA-F0-9]{64}$')
);
CREATE UNIQUE INDEX "flip_voice_contact_permissions_tenant_id_id_key" ON "flip_voice_contact_permissions"("tenant_id","id");
CREATE INDEX "flip_voice_contact_permissions_tenant_id_lead_id_channel_status_idx" ON "flip_voice_contact_permissions"("tenant_id","lead_id","channel","status");

ALTER TABLE "flip_voice_calls" ADD COLUMN "line_id" TEXT;
ALTER TABLE "flip_voice_calls" ADD COLUMN "lead_id" TEXT;
ALTER TABLE "flip_voice_calls" ADD COLUMN "contact_permission_id" TEXT;
CREATE INDEX "flip_voice_calls_tenant_id_line_id_idx" ON "flip_voice_calls"("tenant_id","line_id");

ALTER TABLE "flip_voice_lines" ADD CONSTRAINT "flip_voice_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_voice_lines" ADD CONSTRAINT "flip_voice_lines_tenant_id_profile_id_fkey" FOREIGN KEY ("tenant_id","profile_id") REFERENCES "flip_voice_profiles"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_voice_contact_permissions" ADD CONSTRAINT "flip_voice_contact_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_voice_calls" ADD CONSTRAINT "flip_voice_calls_tenant_id_line_id_fkey" FOREIGN KEY ("tenant_id","line_id") REFERENCES "flip_voice_lines"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flip_voice_calls" ADD CONSTRAINT "flip_voice_calls_tenant_id_contact_permission_id_fkey" FOREIGN KEY ("tenant_id","contact_permission_id") REFERENCES "flip_voice_contact_permissions"("tenant_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
