CREATE TABLE IF NOT EXISTS public.lead_purchases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  purchase_date TIMESTAMP(3) NOT NULL,
  order_number TEXT,
  payment_method TEXT,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT lead_purchases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT lead_purchases_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS lead_purchases_tenant_id_idx ON public.lead_purchases(tenant_id);
CREATE INDEX IF NOT EXISTS lead_purchases_lead_id_idx ON public.lead_purchases(lead_id);
CREATE INDEX IF NOT EXISTS lead_purchases_tenant_purchase_date_idx ON public.lead_purchases(tenant_id, purchase_date);
CREATE INDEX IF NOT EXISTS lead_purchases_tenant_lead_purchase_date_idx ON public.lead_purchases(tenant_id, lead_id, purchase_date);
