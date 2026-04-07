-- Allow medewerkers to insert their own inkooporders
CREATE POLICY "Users can insert own inkooporders"
ON public.inkooporders
FOR INSERT
TO authenticated
WITH CHECK (
  medewerker_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  )
);

-- Allow medewerkers to insert inkooporder_regels for their own orders
CREATE POLICY "Users can insert own inkooporder_regels"
ON public.inkooporder_regels
FOR INSERT
TO authenticated
WITH CHECK (
  inkooporder_id IN (
    SELECT id FROM inkooporders
    WHERE medewerker_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  )
);