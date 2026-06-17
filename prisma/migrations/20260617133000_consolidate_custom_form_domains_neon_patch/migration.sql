-- Consolidate the manual Neon SQL Editor patch for custom form domains.
-- This keeps repository migrations aligned with production hotfixes.

-- Ensure each tenant has at most one primary custom form domain.
CREATE UNIQUE INDEX IF NOT EXISTS "custom_form_domains_one_primary_per_tenant_idx"
ON "custom_form_domains"("tenant_id")
WHERE "is_primary" = true;

-- Ensure the tenant relationship exists when running against databases repaired manually.
DO $$
BEGIN
  IF to_regclass('public.tenants') IS NOT NULL
     AND to_regclass('public.custom_form_domains') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'custom_form_domains_tenant_id_fkey'
         AND conrelid = 'public.custom_form_domains'::regclass
     )
  THEN
    ALTER TABLE public.custom_form_domains
    ADD CONSTRAINT custom_form_domains_tenant_id_fkey
    FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id)
    ON DELETE CASCADE;
  END IF;
END $$;
