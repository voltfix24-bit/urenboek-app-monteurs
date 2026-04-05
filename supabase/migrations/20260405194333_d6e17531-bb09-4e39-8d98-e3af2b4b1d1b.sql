
ALTER TABLE public.projects
  ADD COLUMN straat text,
  ADD COLUMN postcode text,
  ADD COLUMN stad text;

-- Migrate existing adres data to straat
UPDATE public.projects SET straat = adres WHERE adres IS NOT NULL AND adres != '';
