ALTER TABLE public.planning
  ADD COLUMN IF NOT EXISTS activiteit text,
  ADD COLUMN IF NOT EXISTS activiteit_kleur text,
  ADD COLUMN IF NOT EXISTS collega_ids uuid[],
  ADD COLUMN IF NOT EXISTS week_opmerking text;