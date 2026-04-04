
-- 1. Extend profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telefoon text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS adres text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rijbewijs boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS vaste_vrije_dagen int[] NOT NULL DEFAULT '{}';

-- 2. Planning table
CREATE TABLE public.planning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medewerker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  datum date NOT NULL,
  starttijd time NOT NULL DEFAULT '07:00',
  eindtijd time NOT NULL DEFAULT '16:00',
  notitie text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.planning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own planning"
  ON public.planning FOR SELECT TO authenticated
  USING (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Managers can view all planning"
  ON public.planning FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can insert planning"
  ON public.planning FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can update planning"
  ON public.planning FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete planning"
  ON public.planning FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_planning_updated_at
  BEFORE UPDATE ON public.planning
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3. Beschikbaarheid table
CREATE TABLE public.beschikbaarheid (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medewerker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'verlof',
  datum_van date NOT NULL,
  datum_tot date NOT NULL,
  reden text,
  status text NOT NULL DEFAULT 'aangevraagd',
  behandeld_door uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.beschikbaarheid ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own beschikbaarheid"
  ON public.beschikbaarheid FOR SELECT TO authenticated
  USING (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own beschikbaarheid"
  ON public.beschikbaarheid FOR INSERT TO authenticated
  WITH CHECK (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Managers can view all beschikbaarheid"
  ON public.beschikbaarheid FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can update beschikbaarheid"
  ON public.beschikbaarheid FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete beschikbaarheid"
  ON public.beschikbaarheid FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_beschikbaarheid_updated_at
  BEFORE UPDATE ON public.beschikbaarheid
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4. Mededelingen table
CREATE TABLE public.mededelingen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titel text NOT NULL,
  inhoud text NOT NULL DEFAULT '',
  verzonden_door uuid NOT NULL,
  ontvanger_type text NOT NULL DEFAULT 'iedereen',
  ontvanger_id uuid REFERENCES public.profiles(id),
  urgentie text NOT NULL DEFAULT 'normaal',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mededelingen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view mededelingen for them"
  ON public.mededelingen FOR SELECT TO authenticated
  USING (
    ontvanger_type = 'iedereen'
    OR (ontvanger_type = 'monteurs' AND NOT public.has_role(auth.uid(), 'manager'))
    OR (ontvanger_type = 'persoon' AND ontvanger_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "Managers can insert mededelingen"
  ON public.mededelingen FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete mededelingen"
  ON public.mededelingen FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

-- 5. Mededeling leesstatus
CREATE TABLE public.mededeling_leesstatus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mededeling_id uuid NOT NULL REFERENCES public.mededelingen(id) ON DELETE CASCADE,
  medewerker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gelezen_op timestamptz,
  UNIQUE(mededeling_id, medewerker_id)
);

ALTER TABLE public.mededeling_leesstatus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own leesstatus"
  ON public.mededeling_leesstatus FOR SELECT TO authenticated
  USING (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Users can insert own leesstatus"
  ON public.mededeling_leesstatus FOR INSERT TO authenticated
  WITH CHECK (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own leesstatus"
  ON public.mededeling_leesstatus FOR UPDATE TO authenticated
  USING (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- 6. Certificaten table
CREATE TABLE public.certificaten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medewerker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'overig',
  naam text NOT NULL,
  vervaldatum date NOT NULL,
  bestand_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.certificaten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own certificaten"
  ON public.certificaten FOR SELECT TO authenticated
  USING (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own certificaten"
  ON public.certificaten FOR INSERT TO authenticated
  WITH CHECK (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own certificaten"
  ON public.certificaten FOR UPDATE TO authenticated
  USING (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own certificaten"
  ON public.certificaten FOR DELETE TO authenticated
  USING (medewerker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Managers can view all certificaten"
  ON public.certificaten FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can manage certificaten"
  ON public.certificaten FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_certificaten_updated_at
  BEFORE UPDATE ON public.certificaten
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable realtime for mededelingen
ALTER PUBLICATION supabase_realtime ADD TABLE public.mededelingen;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mededeling_leesstatus;
