ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS projectjaar integer;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_projectjaar_range_chk;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_projectjaar_range_chk
  CHECK (projectjaar IS NULL OR (projectjaar BETWEEN 2000 AND 2100));