
-- A) Voeg uurtarief toe aan profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS uurtarief numeric(10,2) DEFAULT NULL;

-- B) project_forecast tabel
CREATE TABLE public.project_forecast (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  methode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

ALTER TABLE public.project_forecast ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers full access forecast" ON public.project_forecast
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_project_forecast_updated_at
  BEFORE UPDATE ON public.project_forecast
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- C) forecast_regels tabel
CREATE TABLE public.forecast_regels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id uuid NOT NULL REFERENCES public.project_forecast(id) ON DELETE CASCADE,
  type text NOT NULL,
  spec_code text,
  spec_omschrijving text,
  tarief_terrevolt numeric(10,2),
  tarief_inkoop numeric(10,2),
  aantal numeric(10,2) DEFAULT 1,
  medewerker_id uuid REFERENCES public.profiles(id),
  geplande_uren numeric(10,2),
  uurtarief_snap numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.forecast_regels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers full access forecast_regels" ON public.forecast_regels
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_forecast_regels_updated_at
  BEFORE UPDATE ON public.forecast_regels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- D) project_planning_status tabel
CREATE TABLE public.project_planning_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  is_definitief boolean NOT NULL DEFAULT false,
  definitief_op timestamptz,
  definitief_door uuid REFERENCES public.profiles(id),
  UNIQUE (project_id)
);

ALTER TABLE public.project_planning_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers full access planning_status" ON public.project_planning_status
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Monteurs can view planning status for their projects" ON public.project_planning_status
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.planning p
      JOIN public.profiles pr ON pr.id = p.medewerker_id
      WHERE p.project_id = project_planning_status.project_id
        AND pr.user_id = auth.uid()
    )
  );
