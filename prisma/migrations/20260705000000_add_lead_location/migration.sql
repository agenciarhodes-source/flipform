ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS state TEXT;

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS city TEXT;

CREATE INDEX IF NOT EXISTS leads_tenant_state_idx
ON public.leads(tenant_id, state);

CREATE INDEX IF NOT EXISTS leads_tenant_city_idx
ON public.leads(tenant_id, city);

CREATE INDEX IF NOT EXISTS leads_tenant_state_city_idx
ON public.leads(tenant_id, state, city);
