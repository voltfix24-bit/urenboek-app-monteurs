-- 1. Tighten INSERT/UPDATE policies to prevent status bypass

-- uren_boekingen
DROP POLICY IF EXISTS "Users can insert own boekingen" ON public.uren_boekingen;
CREATE POLICY "Users can insert own boekingen"
  ON public.uren_boekingen FOR INSERT TO authenticated
  WITH CHECK (
    medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND status = 'concept'
    AND approved_by IS NULL
  );

DROP POLICY IF EXISTS "Users can update own draft/rejected boekingen" ON public.uren_boekingen;
CREATE POLICY "Users can update own draft/rejected boekingen"
  ON public.uren_boekingen FOR UPDATE TO authenticated
  USING (
    medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND status = ANY (ARRAY['concept'::text, 'afgekeurd'::text])
  )
  WITH CHECK (
    medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND status = ANY (ARRAY['concept'::text, 'ingediend'::text])
    AND approved_by IS NULL
  );

-- time_entries
DROP POLICY IF EXISTS "Users can insert own entries" ON public.time_entries;
CREATE POLICY "Users can insert own entries"
  ON public.time_entries FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = ANY (ARRAY['concept'::text, 'ingediend'::text])
    AND approved_by IS NULL
  );

DROP POLICY IF EXISTS "Users can update own draft or rejected entries" ON public.time_entries;
CREATE POLICY "Users can update own draft or rejected entries"
  ON public.time_entries FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND status = ANY (ARRAY['concept'::text, 'ingediend'::text, 'afgekeurd'::text])
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status = ANY (ARRAY['concept'::text, 'ingediend'::text])
    AND approved_by IS NULL
  );

-- inkooporders
DROP POLICY IF EXISTS "Users can insert own inkooporders" ON public.inkooporders;
CREATE POLICY "Users can insert own inkooporders"
  ON public.inkooporders FOR INSERT TO authenticated
  WITH CHECK (
    medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND status = 'concept'
    AND verzonden_op IS NULL
    AND betaald_op IS NULL
  );

-- beschikbaarheid
DROP POLICY IF EXISTS "Users can insert own beschikbaarheid" ON public.beschikbaarheid;
CREATE POLICY "Users can insert own beschikbaarheid"
  ON public.beschikbaarheid FOR INSERT TO authenticated
  WITH CHECK (
    medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND status = 'aangevraagd'
    AND behandeld_door IS NULL
  );

-- overuren_meldingen: insert restricted to 'open'
DROP POLICY IF EXISTS "Users can insert own overuren_meldingen" ON public.overuren_meldingen;
CREATE POLICY "Users can insert own overuren_meldingen"
  ON public.overuren_meldingen FOR INSERT TO authenticated
  WITH CHECK (
    medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND status = 'open'
    AND behandeld_door IS NULL
    AND behandeld_op IS NULL
  );

-- overuren_meldingen: tighten UPDATE so users can't self-approve
DROP POLICY IF EXISTS "Users can update toelichting on own overuren_meldingen" ON public.overuren_meldingen;
CREATE POLICY "Users can update toelichting on own overuren_meldingen"
  ON public.overuren_meldingen FOR UPDATE TO authenticated
  USING (
    medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND status = 'open'
  )
  WITH CHECK (
    medewerker_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND status = 'open'
    AND behandeld_door IS NULL
    AND behandeld_op IS NULL
  );

-- 2. Restrict projects SELECT (was: USING true for everyone)
DROP POLICY IF EXISTS "Authenticated users can view active projects" ON public.projects;

CREATE POLICY "Managers can view all projects"
  ON public.projects FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Monteurs can view assigned projects"
  ON public.projects FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM planning p
      JOIN profiles pr ON pr.id = p.medewerker_id
      WHERE p.project_id = projects.id AND pr.user_id = auth.uid()
    )
  );

-- 3. Recreate views with security_invoker = on
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
  WITH (security_invoker = on) AS
  SELECT id, user_id, full_name, telefoon FROM public.profiles;

DROP VIEW IF EXISTS public.projects_monteur;
CREATE VIEW public.projects_monteur
  WITH (security_invoker = on) AS
  SELECT id, nummer, naam, active, opdrachtgever_id, stationsnaam, adres,
         straat, postcode, stad, case_type, created_at, updated_at
  FROM public.projects;

-- 4. Migrate existing tokens from contract_data into contract_tokens table
INSERT INTO public.contract_tokens (contract_id, token, geldig_tot, gebruikt)
SELECT
  id,
  contract_data->>'_token',
  COALESCE((contract_data->>'_token_geldig_tot')::timestamptz, now() + interval '7 days'),
  false
FROM public.contracten
WHERE contract_data ? '_token'
  AND contract_data->>'_token' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.contract_tokens t
    WHERE t.contract_id = contracten.id
      AND t.token = contracten.contract_data->>'_token'
  );

-- Add index for fast token lookup
CREATE UNIQUE INDEX IF NOT EXISTS contract_tokens_token_idx ON public.contract_tokens(token);
CREATE INDEX IF NOT EXISTS contract_tokens_contract_id_idx ON public.contract_tokens(contract_id);

-- Strip tokens from contract_data after copying
UPDATE public.contracten
SET contract_data = (contract_data - '_token' - '_token_geldig_tot')
WHERE contract_data ? '_token' OR contract_data ? '_token_geldig_tot';