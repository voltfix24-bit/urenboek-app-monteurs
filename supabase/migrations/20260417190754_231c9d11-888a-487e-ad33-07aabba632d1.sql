ALTER TABLE public.project_forecast
ADD COLUMN IF NOT EXISTS verwachte_omzet numeric DEFAULT 0;