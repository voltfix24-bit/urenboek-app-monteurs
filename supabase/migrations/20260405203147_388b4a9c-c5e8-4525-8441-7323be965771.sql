
-- RMU configuraties tabel
CREATE TABLE public.rmu_configuraties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merk text NOT NULL,
  code text NOT NULL,
  velden integer NOT NULL DEFAULT 3,
  label text NOT NULL,
  actief boolean NOT NULL DEFAULT true,
  volgorde integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rmu_configuraties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view rmu_configuraties"
ON public.rmu_configuraties FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Managers can insert rmu_configuraties"
ON public.rmu_configuraties FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can update rmu_configuraties"
ON public.rmu_configuraties FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete rmu_configuraties"
ON public.rmu_configuraties FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

-- Seed bekende configuraties
INSERT INTO public.rmu_configuraties (merk, code, velden, label, volgorde) VALUES
  ('ABB', 'FCC',   3, 'ABB Safe Plus FCC',   1),
  ('ABB', 'FCV',   3, 'ABB Safe Plus FCV',   2),
  ('ABB', 'FCVC',  4, 'ABB Safe Plus FCVC',  3),
  ('ABB', 'FCVV',  4, 'ABB Safe Plus FCVV',  4),
  ('ABB', 'FCCC',  4, 'ABB Safe Plus FCCC',  5),
  ('ABB', 'FCCV',  4, 'ABB Safe Plus FCCV',  6),
  ('ABB', 'FCVCV', 5, 'ABB Safe Plus FCVCV', 7),
  ('ABB', 'FCVVC', 5, 'ABB Safe Plus FCVVC', 8),
  ('Siemens',  'RRT',  3, 'Siemens 8DJH RRT',  1),
  ('Siemens',  'RRRT', 4, 'Siemens 8DJH RRRT', 2),
  ('Magnefix', 'KKT',  3, 'Magnefix KKT',      1),
  ('Magnefix', 'KKKT', 4, 'Magnefix KKKT',     2);

-- Uitbreiden projects tabel
ALTER TABLE public.projects
  ADD COLUMN intake_gedaan boolean NOT NULL DEFAULT false,
  ADD COLUMN rmu_merk text,
  ADD COLUMN rmu_configuratie_id uuid REFERENCES public.rmu_configuraties(id);
