
-- Create uren_boekingen table
CREATE TABLE public.uren_boekingen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medewerker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  datum date NOT NULL,
  uren numeric(5,2) NOT NULL,
  beschrijving text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'monteren',
  status text NOT NULL DEFAULT 'concept',
  afkeur_reden text,
  approved_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.uren_boekingen ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own boekingen"
  ON public.uren_boekingen FOR SELECT
  TO authenticated
  USING (medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own boekingen"
  ON public.uren_boekingen FOR INSERT
  TO authenticated
  WITH CHECK (medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own draft/rejected boekingen"
  ON public.uren_boekingen FOR UPDATE
  TO authenticated
  USING (
    medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND status IN ('concept', 'afgekeurd')
  );

CREATE POLICY "Users can delete own draft boekingen"
  ON public.uren_boekingen FOR DELETE
  TO authenticated
  USING (
    medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND status = 'concept'
  );

CREATE POLICY "Managers can view all boekingen"
  ON public.uren_boekingen FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can update all boekingen"
  ON public.uren_boekingen FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete boekingen"
  ON public.uren_boekingen FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'manager'));

-- Trigger for updated_at
CREATE TRIGGER update_uren_boekingen_updated_at
  BEFORE UPDATE ON public.uren_boekingen
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.uren_boekingen;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mededeling_leesstatus;
