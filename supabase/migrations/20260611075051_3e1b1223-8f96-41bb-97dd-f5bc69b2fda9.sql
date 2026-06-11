
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bedrijfsgegevens_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS bedrijfsgegevens_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
