
-- Security definer helper
CREATE OR REPLACE FUNCTION public.is_onderaannemer_van(_user_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles me
    WHERE me.user_id = _user_id
      AND me.is_onderaannemer = true
      AND (
        me.id = _profile_id
        OR EXISTS (
          SELECT 1 FROM public.profiles sub
          WHERE sub.id = _profile_id
            AND sub.onderaannemer_id = me.id
        )
      )
  )
$$;

-- Profiles: onderaannemer ziet zijn monteurs
CREATE POLICY "Onderaannemer can view own monteurs profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_onderaannemer_van(auth.uid(), id));

-- Planning
CREATE POLICY "Onderaannemer can view planning of own monteurs"
ON public.planning FOR SELECT
TO authenticated
USING (public.is_onderaannemer_van(auth.uid(), medewerker_id));

-- Beschikbaarheid
CREATE POLICY "Onderaannemer can view beschikbaarheid of own monteurs"
ON public.beschikbaarheid FOR SELECT
TO authenticated
USING (public.is_onderaannemer_van(auth.uid(), medewerker_id));

-- Certificaten
CREATE POLICY "Onderaannemer can view certs of own monteurs"
ON public.certificaten FOR SELECT
TO authenticated
USING (public.is_onderaannemer_van(auth.uid(), medewerker_id));

-- Uren_boekingen: SELECT, INSERT, UPDATE, DELETE voor onderaannemer namens monteurs
CREATE POLICY "Onderaannemer can view uren of own monteurs"
ON public.uren_boekingen FOR SELECT
TO authenticated
USING (public.is_onderaannemer_van(auth.uid(), medewerker_id));

CREATE POLICY "Onderaannemer can insert uren for own monteurs"
ON public.uren_boekingen FOR INSERT
TO authenticated
WITH CHECK (
  public.is_onderaannemer_van(auth.uid(), medewerker_id)
  AND status IN ('concept','ingediend')
  AND approved_by IS NULL
);

CREATE POLICY "Onderaannemer can update uren of own monteurs"
ON public.uren_boekingen FOR UPDATE
TO authenticated
USING (
  public.is_onderaannemer_van(auth.uid(), medewerker_id)
  AND status IN ('concept','ingediend','afgekeurd')
)
WITH CHECK (
  public.is_onderaannemer_van(auth.uid(), medewerker_id)
  AND status IN ('concept','ingediend')
  AND approved_by IS NULL
);

CREATE POLICY "Onderaannemer can delete concept uren of own monteurs"
ON public.uren_boekingen FOR DELETE
TO authenticated
USING (
  public.is_onderaannemer_van(auth.uid(), medewerker_id)
  AND status IN ('concept','afgekeurd')
);
