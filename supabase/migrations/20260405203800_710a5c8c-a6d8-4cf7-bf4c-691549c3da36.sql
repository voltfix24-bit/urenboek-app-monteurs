
CREATE TABLE public.intake_regels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actief boolean NOT NULL DEFAULT true,
  volgorde integer NOT NULL DEFAULT 0,
  trigger_type text NOT NULL,
  trigger_veld text,
  trigger_waarde text,
  spec_code text NOT NULL,
  label text NOT NULL,
  standaard_aantal numeric NOT NULL DEFAULT 1,
  min_aantal numeric NOT NULL DEFAULT 0,
  max_aantal numeric NOT NULL DEFAULT 99,
  aanpasbaar boolean NOT NULL DEFAULT true,
  waarschuwing text,
  hint text,
  vereist_code text,
  sluit_uit_code text,
  sluit_uit_reden text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.intake_regels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view intake_regels"
ON public.intake_regels FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Managers can insert intake_regels"
ON public.intake_regels FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can update intake_regels"
ON public.intake_regels FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete intake_regels"
ON public.intake_regels FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_intake_regels_updated_at
BEFORE UPDATE ON public.intake_regels
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Seed alle bekende regels
INSERT INTO public.intake_regels (trigger_type, trigger_veld, trigger_waarde, spec_code, label, standaard_aantal, min_aantal, max_aantal, aanpasbaar, waarschuwing, hint, sluit_uit_code, sluit_uit_reden, volgorde) VALUES
  -- RMU basis
  ('antwoord', 'rmu_vervangen', 'ja', 'R320010', 'MS-installatie', 1, 1, 1, false, NULL, NULL, 'R320040', 'Compactstation gebruikt R320040', 10),
  -- Extra MS-veld per veld boven 3
  ('rmu_velden_gt', 'rmu_velden', '3', 'R320020', 'Extra MS-veld', 1, 0, 10, true, NULL, NULL, NULL, NULL, 11),
  -- Compactstation ipv standaard RMU
  ('case_type', 'case_type', 'compactstation', 'R320040', 'Compactstation', 1, 1, 1, false, NULL, NULL, 'R320010', 'Compact gebruikt R320040 ipv R320010', 12),
  -- Case type specifiek
  ('case_type', 'case_type', 'nsa-case', 'R370030', 'NSA', 1, 1, 1, false, NULL, NULL, NULL, NULL, 20),
  ('case_type', 'case_type', 'provisorium', 'R370010', 'Provisorium', 1, 1, 1, false, NULL, NULL, NULL, NULL, 21),
  -- Trafo
  ('antwoord', 'trafo_situatie', 'nieuw', 'R330010', 'Plaatsen trafo', 1, 1, 1, false, NULL, NULL, NULL, NULL, 30),
  ('antwoord', 'trafo_situatie', 'draaien', 'R330020', 'Draaien trafo', 1, 1, 1, false, NULL, NULL, NULL, NULL, 31),
  -- LS rek
  ('antwoord', 'ls_rek', 'klein', 'R340010', 'LS-rek ≤630kVA', 1, 1, 1, false, NULL, NULL, NULL, NULL, 40),
  ('antwoord', 'ls_rek', 'groot', 'R340020', 'LS-rek >630kVA', 1, 1, 1, false, NULL, NULL, NULL, NULL, 41),
  ('antwoord', 'ls_stroken', 'gt0', 'R340040', 'LS stroken', 1, 0, 20, true, NULL, NULL, NULL, NULL, 42),
  ('antwoord', 'ls_kabels', 'gt0', 'R340050', 'LS-kabel aansluiten', 1, 0, 20, true, NULL, NULL, NULL, NULL, 43),
  -- MS eindsluitingen
  ('altijd', NULL, NULL, 'R410010', 'MS eindsluiting', 0, 0, 20, true, NULL, 'Aantal kabelvelden = aantal eindsluitingen', NULL, NULL, 50),
  ('case_type', 'case_type', 'provisorium', 'R410010', 'MS eindsluiting tbv provisorium', 0, 0, 20, true, 'Let op: vul eindsluitingen in tbv provisorium', NULL, NULL, NULL, 51),
  -- MS moffen
  ('altijd', NULL, NULL, 'R410020', 'MS verbindingsmof', 0, 0, 20, true, NULL, 'Aantal moffen buiten = aantal kabelvelden', NULL, NULL, 52),
  -- Vereffeningsleiding
  ('antwoord', 'vereffeningsleiding', 'ja', 'R350020', 'Vereffeningsleiding', 2, 0, 10, true, NULL, 'Standaard 2, aanpasbaar', NULL, NULL, 60),
  -- Aardweerstand
  ('antwoord', 'aardweerstand', 'ja', 'R350010', 'Meten aardweerstand', 1, 1, 1, false, NULL, NULL, NULL, NULL, 61),
  -- GGI
  ('antwoord', 'ggi', 'ja', 'R310030', 'GGI', 2, 0, 10, true, NULL, 'Standaard 2, aanpasbaar', NULL, NULL, 62),
  -- Boren
  ('antwoord', 'boren', 'ja', 'R310010', 'Boren/coördinatie', 1, 1, 1, false, NULL, NULL, NULL, NULL, 63),
  -- Revisie
  ('antwoord', 'revisie', 'ja', 'R500020', 'Revisie excl civiel', 1, 1, 1, false, NULL, 'Alleen bij oplevering', NULL, NULL, 64),
  -- WV-er per case type
  ('case_type', 'case_type', 'nsa-case', 'R440010', 'WV-er', 16, 0, 999, true, NULL, NULL, NULL, NULL, 70),
  ('case_type', 'case_type', 'compactstation', 'R440010', 'WV-er', 16, 0, 999, true, NULL, NULL, NULL, NULL, 71),
  ('case_type', 'case_type', 'provisorium', 'R440010', 'WV-er', 32, 0, 999, true, NULL, NULL, NULL, NULL, 72),
  -- WV-er io per case type
  ('case_type', 'case_type', 'nsa-case', 'R440020', 'WV-er io', 16, 0, 999, true, NULL, NULL, NULL, NULL, 73),
  ('case_type', 'case_type', 'compactstation', 'R440020', 'WV-er io', 16, 0, 999, true, NULL, NULL, NULL, NULL, 74),
  ('case_type', 'case_type', 'provisorium', 'R440020', 'WV-er io', 32, 0, 999, true, NULL, NULL, NULL, NULL, 75);
