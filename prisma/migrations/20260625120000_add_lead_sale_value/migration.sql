ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS sale_value_cents INTEGER;

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS sale_currency TEXT NOT NULL DEFAULT 'BRL';

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS sale_value_updated_at TIMESTAMP(3);

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS sale_value_updated_by TEXT;
