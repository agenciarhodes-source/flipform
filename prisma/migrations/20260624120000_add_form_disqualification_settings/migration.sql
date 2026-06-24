ALTER TABLE public.forms
ADD COLUMN IF NOT EXISTS disqualification_settings JSONB;
