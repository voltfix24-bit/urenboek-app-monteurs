-- Voeg onderaannemer-concept toe aan profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_onderaannemer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onderaannemer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_onderaannemer_id ON public.profiles(onderaannemer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_onderaannemer ON public.profiles(is_onderaannemer) WHERE is_onderaannemer = true;