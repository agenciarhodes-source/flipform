ALTER TABLE public.forms
ADD COLUMN IF NOT EXISTS lead_source TEXT;

UPDATE public.forms
SET lead_source = 'formulario'
WHERE lead_source IS NULL
   OR btrim(lead_source) = '';

ALTER TABLE public.forms
ALTER COLUMN lead_source
SET DEFAULT 'formulario';

ALTER TABLE public.forms
ALTER COLUMN lead_source
SET NOT NULL;

CREATE INDEX IF NOT EXISTS forms_tenant_id_lead_source_idx
ON public.forms (tenant_id, lead_source);

CREATE INDEX IF NOT EXISTS leads_tenant_id_source_idx
ON public.leads (tenant_id, source);
