
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nummer TEXT NOT NULL UNIQUE,
  naam TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active projects"
ON public.projects FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Managers can insert projects"
ON public.projects FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can update projects"
ON public.projects FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can delete projects"
ON public.projects FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

INSERT INTO public.projects (nummer, naam) VALUES
  ('CS-2024-001', 'Burg. VD Fletzlaan'),
  ('CS-2024-002', 'Amstel Energiepark'),
  ('CS-2024-003', 'Zuidoost Middenspanning'),
  ('CS-2024-004', 'Diemen Noord Substation'),
  ('CS-2024-005', 'Weesp Compactstation');
