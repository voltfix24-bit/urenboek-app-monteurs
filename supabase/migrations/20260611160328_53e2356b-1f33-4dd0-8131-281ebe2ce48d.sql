-- Stable mappings for the one-way TerreVolt Planner integration.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS planner_project_id uuid;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS planner_monteur_id uuid;

ALTER TABLE public.planning
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_locked boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS projects_planner_project_unique
  ON public.projects (planner_project_id)
  WHERE planner_project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_planner_monteur_unique
  ON public.profiles (planner_monteur_id)
  WHERE planner_monteur_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS planning_external_identity_unique
  ON public.planning (external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

ALTER TABLE public.planning
  DROP CONSTRAINT IF EXISTS planning_external_source_check;

ALTER TABLE public.planning
  ADD CONSTRAINT planning_external_source_check
  CHECK (external_source IS NULL OR external_source = 'terrevolt_planner');