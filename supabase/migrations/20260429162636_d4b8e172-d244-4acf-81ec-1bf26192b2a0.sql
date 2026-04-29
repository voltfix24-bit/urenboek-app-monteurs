DROP POLICY IF EXISTS "Users can update own draft/rejected boekingen" ON public.uren_boekingen;

CREATE POLICY "Users can update own non-approved boekingen"
ON public.uren_boekingen
FOR UPDATE
TO authenticated
USING (
  (medewerker_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
  AND status IN ('concept','ingediend','afgekeurd')
)
WITH CHECK (
  (medewerker_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
  AND status IN ('concept','ingediend')
  AND approved_by IS NULL
);