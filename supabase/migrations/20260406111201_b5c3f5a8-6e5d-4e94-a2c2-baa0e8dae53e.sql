
CREATE TABLE public.bedrijfsgegevens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bedrijfsnaam text NOT NULL,
  rechtsvorm text,
  straat text,
  postcode text,
  stad text,
  land text NOT NULL DEFAULT 'Nederland',
  email text,
  telefoon text,
  kvk_nummer text,
  btw_nummer text,
  iban text,
  iban_naam text,
  website text,
  betalingstermijn integer NOT NULL DEFAULT 14,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.bedrijfsgegevens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bedrijfsgegevens"
  ON public.bedrijfsgegevens FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Managers can insert bedrijfsgegevens"
  ON public.bedrijfsgegevens FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can update bedrijfsgegevens"
  ON public.bedrijfsgegevens FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Managers can delete bedrijfsgegevens"
  ON public.bedrijfsgegevens FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

INSERT INTO public.bedrijfsgegevens (
  bedrijfsnaam, rechtsvorm, straat, postcode, stad, land,
  email, kvk_nummer, btw_nummer, iban, iban_naam, betalingstermijn
) VALUES (
  'TerreVolt B.V.',
  'B.V. - Besloten vennootschap',
  'Vlierweg 12',
  '1032 LG',
  'Amsterdam',
  'Nederland',
  'info@terrevolt.nl',
  '98495976',
  'NL868519522B01',
  'NL49INGB0113028776',
  'TerreVolt B.V.',
  14
);
