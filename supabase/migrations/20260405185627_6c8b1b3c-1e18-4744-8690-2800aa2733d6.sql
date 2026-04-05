-- Add new columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS noodcontact_naam text,
  ADD COLUMN IF NOT EXISTS noodcontact_tel text,
  ADD COLUMN IF NOT EXISTS contract_einddatum date;

-- Create app_setup table
CREATE TABLE IF NOT EXISTS public.app_setup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_setup ENABLE ROW LEVEL SECURITY;

-- Everyone can read app_setup
CREATE POLICY "Anyone can read app_setup"
  ON public.app_setup
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- No client INSERT/UPDATE/DELETE
CREATE POLICY "No client write on app_setup"
  ON public.app_setup
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);