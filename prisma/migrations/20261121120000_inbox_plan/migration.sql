-- Plano Inbox (R$ 397): only the WhatsApp attendance (lib/billing/plan-catalog.ts PLAN_CATALOG_SPECIAL).
-- Additive and idempotent: creates the plan only when it does not exist; nothing else changes.
-- Review and apply manually; never use prisma migrate deploy in production.
INSERT INTO "plans" (
  "id", "name", "slug", "description", "price", "billing_cycle", "max_users", "max_forms",
  "max_pipelines", "max_leads_per_month", "can_use_reports", "can_export_csv",
  "can_use_custom_branding", "can_use_meta_pixel", "can_use_webhooks", "can_use_tasks",
  "is_active", "created_at", "updated_at"
) VALUES
  (gen_random_uuid()::text, 'Inbox', 'inbox', 'Somente o atendimento: Inbox do WhatsApp oficial com vários números', 397.00, 'monthly', 0, 0, 0, 0, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;
