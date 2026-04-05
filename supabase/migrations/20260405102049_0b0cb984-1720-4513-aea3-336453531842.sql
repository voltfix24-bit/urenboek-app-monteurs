
-- Add new columns to projects table
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS stationsnaam text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS adres text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS case_type text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contactpersoon_naam text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contactpersoon_tel text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contactpersoon_email text;

-- Create a public view without contact person fields
CREATE OR REPLACE VIEW public.projects_public AS
SELECT id, nummer, naam, active, opdrachtgever_id, stationsnaam, adres, case_type, created_at, updated_at
FROM public.projects;
