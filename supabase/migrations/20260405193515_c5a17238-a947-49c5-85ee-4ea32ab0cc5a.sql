ALTER TABLE public.certificaten ADD COLUMN IF NOT EXISTS subtype text;
ALTER TABLE public.certificaten ADD COLUMN IF NOT EXISTS ggi_gebieden text[];