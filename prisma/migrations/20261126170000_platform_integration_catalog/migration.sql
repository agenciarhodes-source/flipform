-- Additive global catalog metadata. No tenant data or credentials.
CREATE TABLE "platform_catalog_apps" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "plan_slugs" TEXT[] NOT NULL,
    "icon_png" TEXT,
    "icon_digest" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_catalog_apps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pc_app_limits" CHECK (length("id") BETWEEN 1 AND 64 AND length("label") BETWEEN 1 AND 80 AND length("description") <= 300 AND length("category") BETWEEN 1 AND 60 AND "sort_order" BETWEEN 0 AND 9999 AND "revision" > 0),
    CONSTRAINT "pc_app_plans" CHECK (cardinality("plan_slugs") <= 8 AND array_position("plan_slugs", NULL) IS NULL AND "plan_slugs" <@ ARRAY['free','starter','growth','pro','inbox','business','premium','premium-pro']::TEXT[]),
    CONSTRAINT "pc_app_icon" CHECK (("icon_png" IS NULL AND "icon_digest" IS NULL) OR ("icon_png" IS NOT NULL AND "icon_digest" IS NOT NULL AND length("icon_png") BETWEEN 1 AND 87384 AND "icon_digest" ~ '^[a-f0-9]{64}$'))
);
CREATE TABLE "platform_catalog_audits" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_catalog_audits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pc_audit_app_fk" FOREIGN KEY ("app_id") REFERENCES "platform_catalog_apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "pc_audit_revision_key" ON "platform_catalog_audits"("app_id","revision");
CREATE INDEX "pc_audit_time_idx" ON "platform_catalog_audits"("created_at");
