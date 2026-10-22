-- Official plan catalog, October 2026 (lib/billing/plan-catalog.ts), approved by the owner.
-- Additive and idempotent: creates missing plans and sets the approved prices, limits and features.
-- In production the values were already applied on 2026-10-22, so running it there changes nothing.
-- Review and apply manually; never use prisma migrate deploy in production. The slug never changes.
INSERT INTO "plans" (
  "id", "name", "slug", "description", "price", "billing_cycle", "max_users", "max_forms",
  "max_pipelines", "max_leads_per_month", "can_use_reports", "can_export_csv",
  "can_use_custom_branding", "can_use_meta_pixel", "can_use_webhooks", "can_use_tasks",
  "is_active", "created_at", "updated_at"
) VALUES
  (gen_random_uuid()::text, 'Free', 'free', 'Plano gratuito para testar', 0.00, 'monthly', 2, 1, 0, 0, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, NOW(), NOW()),
  (gen_random_uuid()::text, 'Starter', 'starter', 'Para times pequenos', 49.00, 'monthly', 5, 5, 2, 1000, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, NOW(), NOW()),
  (gen_random_uuid()::text, 'Growth', 'growth', 'Plano recomendado para operação comercial em crescimento.', 197.00, 'monthly', 5, 10, 3, 3000, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE, TRUE, NOW(), NOW()),
  (gen_random_uuid()::text, 'Pro', 'pro', 'Para times em crescimento', 349.00, 'monthly', 15, 20, 0, 0, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, NOW(), NOW()),
  (gen_random_uuid()::text, 'Business', 'business', 'Empresas com alto volume de leads', 599.00, 'monthly', 50, 100, 0, 0, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, NOW(), NOW()),
  (gen_random_uuid()::text, 'Premium', 'premium', 'FlipForm Premium + consumo de IA', 997.00, 'monthly', 0, 0, 0, 0, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, NOW(), NOW()),
  (gen_random_uuid()::text, 'Premium Pro', 'premium-pro', 'FlipForm Premium Pro + consumo de IA', 1497.00, 'monthly', 0, 0, 0, 0, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, NOW(), NOW())
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "price" = EXCLUDED."price",
  "max_users" = EXCLUDED."max_users",
  "max_forms" = EXCLUDED."max_forms",
  "max_pipelines" = EXCLUDED."max_pipelines",
  "max_leads_per_month" = EXCLUDED."max_leads_per_month",
  "can_use_reports" = EXCLUDED."can_use_reports",
  "can_export_csv" = EXCLUDED."can_export_csv",
  "can_use_custom_branding" = EXCLUDED."can_use_custom_branding",
  "can_use_meta_pixel" = EXCLUDED."can_use_meta_pixel",
  "can_use_webhooks" = EXCLUDED."can_use_webhooks",
  "can_use_tasks" = EXCLUDED."can_use_tasks",
  "is_active" = EXCLUDED."is_active",
  "updated_at" = NOW()
WHERE (
  "plans"."name", "plans"."description", "plans"."price", "plans"."max_users", "plans"."max_forms",
  "plans"."max_pipelines", "plans"."max_leads_per_month", "plans"."can_use_reports", "plans"."can_export_csv",
  "plans"."can_use_custom_branding", "plans"."can_use_meta_pixel", "plans"."can_use_webhooks",
  "plans"."can_use_tasks", "plans"."is_active"
) IS DISTINCT FROM (
  EXCLUDED."name", EXCLUDED."description", EXCLUDED."price", EXCLUDED."max_users", EXCLUDED."max_forms",
  EXCLUDED."max_pipelines", EXCLUDED."max_leads_per_month", EXCLUDED."can_use_reports", EXCLUDED."can_export_csv",
  EXCLUDED."can_use_custom_branding", EXCLUDED."can_use_meta_pixel", EXCLUDED."can_use_webhooks",
  EXCLUDED."can_use_tasks", EXCLUDED."is_active"
);
