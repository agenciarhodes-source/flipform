CREATE TABLE "lead_attributions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_content" TEXT,
    "utm_term" TEXT,
    "fbclid" TEXT,
    "fbc" TEXT,
    "fbp" TEXT,
    "gclid" TEXT,
    "landing_page" TEXT,
    "referrer" TEXT,
    "client_ip" TEXT,
    "client_user_agent" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_attributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_attributions_lead_id_key" ON "lead_attributions"("lead_id");
CREATE INDEX "lead_attributions_tenant_id_idx" ON "lead_attributions"("tenant_id");
CREATE INDEX "lead_attributions_tenant_id_utm_source_idx" ON "lead_attributions"("tenant_id", "utm_source");
CREATE INDEX "lead_attributions_tenant_id_utm_campaign_idx" ON "lead_attributions"("tenant_id", "utm_campaign");
CREATE INDEX "lead_attributions_tenant_id_captured_at_idx" ON "lead_attributions"("tenant_id", "captured_at");

ALTER TABLE "lead_attributions" ADD CONSTRAINT "lead_attributions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_attributions" ADD CONSTRAINT "lead_attributions_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
