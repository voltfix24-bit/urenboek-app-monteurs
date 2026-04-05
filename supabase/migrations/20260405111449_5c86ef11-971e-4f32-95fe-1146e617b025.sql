
CREATE TABLE public.project_planning_matrix (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id),
  CONSTRAINT project_planning_matrix_project_id_key UNIQUE (project_id)
);

ALTER TABLE public.project_planning_matrix ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers full access planning_matrix"
  ON public.project_planning_matrix
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));
