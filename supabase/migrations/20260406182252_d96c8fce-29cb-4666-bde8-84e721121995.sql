ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS geboortedatum date,
  ADD COLUMN IF NOT EXISTS onboarding_voltooid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_voltooid_op timestamptz,
  ADD COLUMN IF NOT EXISTS geverifieerd_door uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS geverifieerd_op timestamptz;

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;