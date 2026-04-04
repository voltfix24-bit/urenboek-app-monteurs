
CREATE TABLE public.opdrachtgevers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  naam TEXT NOT NULL,
  contactpersoon TEXT NOT NULL DEFAULT '',
  telefoon TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.opdrachtgevers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view opdrachtgevers"
ON public.opdrachtgevers FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can insert opdrachtgevers"
ON public.opdrachtgevers FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can update opdrachtgevers"
ON public.opdrachtgevers FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can delete opdrachtgevers"
ON public.opdrachtgevers FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_opdrachtgevers_updated_at
BEFORE UPDATE ON public.opdrachtgevers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.projects ADD COLUMN opdrachtgever_id UUID REFERENCES public.opdrachtgevers(id) ON DELETE SET NULL;
