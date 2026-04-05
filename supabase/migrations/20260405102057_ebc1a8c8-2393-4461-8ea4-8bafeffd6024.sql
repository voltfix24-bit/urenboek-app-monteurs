
-- Recreate view with security invoker to respect RLS of the querying user
DROP VIEW IF EXISTS public.projects_public;
CREATE VIEW public.projects_public WITH (security_invoker = true) AS
SELECT id, nummer, naam, active, opdrachtgever_id, stationsnaam, adres, case_type, created_at, updated_at
FROM public.projects;
