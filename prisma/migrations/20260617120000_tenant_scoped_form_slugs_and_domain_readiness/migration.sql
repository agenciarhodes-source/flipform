-- Allow the same form slug in different tenants while keeping slugs unique inside a tenant.
ALTER TABLE public.forms
DROP CONSTRAINT IF EXISTS forms_slug_key;

DROP INDEX IF EXISTS public.forms_slug_key;
DROP INDEX IF EXISTS public."forms_slug_key";
DROP INDEX IF EXISTS public."Form_slug_key";

CREATE UNIQUE INDEX IF NOT EXISTS forms_tenant_id_slug_key
ON public.forms (tenant_id, slug);

CREATE INDEX IF NOT EXISTS forms_tenant_id_created_at_idx
ON public.forms (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS forms_tenant_id_pipeline_id_idx
ON public.forms (tenant_id, pipeline_id);

CREATE INDEX IF NOT EXISTS forms_tenant_id_is_active_idx
ON public.forms (tenant_id, is_active);

-- Complete custom form domain readiness indexes.
CREATE INDEX IF NOT EXISTS "custom_form_domains_verification_status_idx" ON "custom_form_domains"("verification_status");
