CREATE TABLE public.planning_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam text NOT NULL,
  omschrijving text,
  activiteiten text[] NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  volgorde integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.planning_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view templates"
ON public.planning_templates FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Managers can insert templates"
ON public.planning_templates FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can update templates"
ON public.planning_templates FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete templates"
ON public.planning_templates FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_planning_templates_updated_at
BEFORE UPDATE ON public.planning_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

INSERT INTO public.planning_templates (naam, omschrijving, activiteiten, is_default, volgorde)
VALUES
  ('NSA-case', 'Standaard NSA vervanging', ARRAY['Civiele werkzaamheden','Levering NSA','MS-installatie','LS-aansluiting','Inbedrijfstelling','Revisie & oplevering'], true, 1),
  ('Compactstation', 'Nieuw compactstation plaatsen', ARRAY['Civiele werkzaamheden','Levering Compactstation','MS-aansluiting','LS-configuratie','Inbedrijfstelling','Oplevering'], true, 2),
  ('Provisorium', 'Tijdelijke voorziening', ARRAY['Levering Provisorium','Plaatsen RMU Magnefix','Kabelaansluiting MS','LS tijdelijk','Inbedrijfstelling','Definitief terugplaatsen'], true, 3);