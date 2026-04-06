
-- 1. Projects tabel uitbreiden met status workflow
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'nieuw',
  ADD COLUMN IF NOT EXISTS status_gewijzigd_op timestamptz,
  ADD COLUMN IF NOT EXISTS status_gewijzigd_door uuid REFERENCES public.profiles(id);

-- 2. Profiles tabel uitbreiden met ZZP gegevens
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kvk_nummer text,
  ADD COLUMN IF NOT EXISTS btw_nummer text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS bedrijfsnaam text,
  ADD COLUMN IF NOT EXISTS factuuradres text,
  ADD COLUMN IF NOT EXISTS betalingstermijn integer NOT NULL DEFAULT 14;

-- 3. Forecast regels uitbreiden met werkelijk aantal
ALTER TABLE public.forecast_regels
  ADD COLUMN IF NOT EXISTS werkelijk_aantal numeric;

-- 4. Inkooporders tabel
CREATE TABLE public.inkooporders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_nummer text UNIQUE NOT NULL,
  medewerker_id uuid NOT NULL REFERENCES public.profiles(id),
  periode_van date NOT NULL,
  periode_tot date NOT NULL,
  status text NOT NULL DEFAULT 'concept',
  totaal_uren numeric(10,2),
  totaal_excl_btw numeric(10,2),
  btw_bedrag numeric(10,2),
  totaal_incl_btw numeric(10,2),
  aangemaakt_door uuid REFERENCES public.profiles(id),
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  verzonden_op timestamptz,
  factuur_datum timestamptz,
  factuur_nummer text,
  betaald_op timestamptz,
  notitie text
);

ALTER TABLE public.inkooporders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers full access inkooporders"
  ON public.inkooporders FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'manager'));

CREATE POLICY "Monteurs can view own inkooporders"
  ON public.inkooporders FOR SELECT TO authenticated
  USING (medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- 5. Inkooporder regels tabel
CREATE TABLE public.inkooporder_regels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inkooporder_id uuid NOT NULL REFERENCES public.inkooporders(id) ON DELETE CASCADE,
  uren_boeking_id uuid REFERENCES public.uren_boekingen(id),
  datum date NOT NULL,
  project_id uuid REFERENCES public.projects(id),
  project_naam text,
  activiteit text,
  uren numeric(10,2) NOT NULL,
  uurtarief numeric(10,2) NOT NULL,
  bedrag numeric(10,2) NOT NULL
);

ALTER TABLE public.inkooporder_regels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers full access inkooporder_regels"
  ON public.inkooporder_regels FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'manager'));

CREATE POLICY "Monteurs can view own inkooporder_regels"
  ON public.inkooporder_regels FOR SELECT TO authenticated
  USING (inkooporder_id IN (
    SELECT id FROM inkooporders
    WHERE medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  ));

-- 6. Update bestaande projecten: zet active projecten op 'in_uitvoering'
UPDATE public.projects SET status = 'in_uitvoering' WHERE active = true;
UPDATE public.projects SET status = 'gesloten' WHERE active = false;
