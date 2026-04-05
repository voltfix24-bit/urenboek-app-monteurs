
-- Create spec_code_tarieven table
CREATE TABLE public.spec_code_tarieven (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  omschrijving text NOT NULL,
  eenheid text NOT NULL,
  tarief numeric(10,2) NOT NULL,
  actief boolean NOT NULL DEFAULT true,
  groep text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.spec_code_tarieven ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view spec_code_tarieven"
  ON public.spec_code_tarieven FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can insert spec_code_tarieven"
  ON public.spec_code_tarieven FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can update spec_code_tarieven"
  ON public.spec_code_tarieven FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can delete spec_code_tarieven"
  ON public.spec_code_tarieven FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role));

-- Seed all Van Gelder tariffs
INSERT INTO public.spec_code_tarieven (code, omschrijving, eenheid, tarief, groep) VALUES
('R310010','Boren gaten tbv doorvoeren kabels','st',66.56,'R31x'),
('R310020','Dichtzetten oude doorvoeringen','st',59.13,'R31x'),
('R310030','Gebouwgebonden installatie (GGI)','st',235.99,'R31x'),
('R310040','Traanplaat over vloersparing','st',302.66,'R31x'),
('R320010','Basis MS-installatie incl trafokabel','st',9200.98,'R32x'),
('R320020','Extra MS-veld','st',1696.24,'R32x'),
('R320030','Ombouw MS-installatie naar iMS','st',813.27,'R32x'),
('R320040','Compactstation (nieuw)','st',6493.32,'R32x'),
('R330010','Plaatsen en aansluiten transformator','st',1504.04,'R33x'),
('R330020','Draaien transformator','st',1241.86,'R33x'),
('R330030','Trafokabel betreedbaar station','st',821.25,'R33x'),
('R330040','Trafokabel compactstation','st',810.46,'R33x'),
('R330050','Vrijschakelen en veiligstellen trafo','st',300.81,'R33x'),
('R340010','Plaatsen LS-rek ≤630kVA','st',2460.94,'R34x'),
('R340020','Plaatsen LS-rek >630kVA ≤1000kVA','st',2808.08,'R34x'),
('R340030','Plaatsen uitbreidingsrek','st',509.43,'R34x'),
('R340040','LS stroken plaatsen/herschikken','st',101.89,'R34x'),
('R340050','Aansluiten LS-kabel met eindsluiting','st',165.55,'R34x'),
('R340060','Wisselen zekeringen','st',73.45,'R34x'),
('R350010','Meten aardverspreidingsweerstand','keer',164.76,'R35x'),
('R350020','Vernieuwen vereffeningsleiding','st',1253.70,'R35x'),
('R360010','Montage flex OV kast','st',487.61,'R36x'),
('R360020','Ophangen OV kWh-meter','st',106.02,'R36x'),
('R370010','Toepassen provisorium','st',3875.16,'R37x'),
('R370020','LS kast aansluiten en ontkoppelen','st',815.10,'R37x'),
('R370030','NSA coördinatie en montage','st',601.62,'R37x'),
('R410010','Monteren MS mof','st',610.93,'R41x'),
('R410020','Monteren MS eindsluiting','st',494.74,'R41x'),
('R420010','Monteren LS mof','st',141.35,'R42x'),
('R420020','Monteren LS eindsluiting','st',115.15,'R42x'),
('R430010','Overzetten huisaansluiting','st',314.88,'R43x'),
('R430020','Verwijderen LS kast','st',442.16,'R43x'),
('R440010','Inzet werkverantwoordelijke (WV-er)','uur',110.00,'R44x'),
('R440020','Inzet WV-er in opleiding (WV-io)','uur',50.00,'R44x'),
('R440030','Vrijschakelen kabeldeel','keer',300.81,'R44x'),
('R500010','Revisiedossier volledig','st',1393.63,'R50x'),
('R500020','Revisiedossier excl civiel','st',939.49,'R50x'),
('R610040','Inzetten VP','uur',70.00,'R61x'),
('R610050','Inzetten AVP distributie','uur',75.00,'R61x'),
('R610060','Inzetten VOP','uur',55.00,'R61x');

-- Rename forecast_regels columns
ALTER TABLE public.forecast_regels RENAME COLUMN tarief_terrevolt TO tarief;
ALTER TABLE public.forecast_regels RENAME COLUMN tarief_inkoop TO eigen_kosten;
