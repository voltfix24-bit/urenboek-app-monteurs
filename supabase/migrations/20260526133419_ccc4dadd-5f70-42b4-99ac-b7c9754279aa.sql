
-- 1) Restrict bedrijfsgegevens SELECT to managers
DROP POLICY IF EXISTS "Authenticated users can view bedrijfsgegevens" ON public.bedrijfsgegevens;
CREATE POLICY "Managers can view bedrijfsgegevens"
ON public.bedrijfsgegevens
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));

-- 2) Allow monteurs to read contract_berichten of their own contracten
CREATE POLICY "Monteurs can view own contract_berichten"
ON public.contract_berichten
FOR SELECT
TO authenticated
USING (
  contract_id IN (
    SELECT c.id FROM public.contracten c
    JOIN public.profiles p ON p.id = c.profiel_id
    WHERE p.user_id = auth.uid()
  )
);

-- 3) Allow workers UPDATE/DELETE on their own concept inkooporder_regels
CREATE POLICY "Users can update own concept inkooporder_regels"
ON public.inkooporder_regels
FOR UPDATE
TO authenticated
USING (
  inkooporder_id IN (
    SELECT io.id FROM public.inkooporders io
    JOIN public.profiles p ON p.id = io.medewerker_id
    WHERE p.user_id = auth.uid() AND io.status = 'concept'
  )
)
WITH CHECK (
  inkooporder_id IN (
    SELECT io.id FROM public.inkooporders io
    JOIN public.profiles p ON p.id = io.medewerker_id
    WHERE p.user_id = auth.uid() AND io.status = 'concept'
  )
);

CREATE POLICY "Users can delete own concept inkooporder_regels"
ON public.inkooporder_regels
FOR DELETE
TO authenticated
USING (
  inkooporder_id IN (
    SELECT io.id FROM public.inkooporders io
    JOIN public.profiles p ON p.id = io.medewerker_id
    WHERE p.user_id = auth.uid() AND io.status = 'concept'
  )
);

-- 4) Tighten EXECUTE on SECURITY DEFINER / internal functions
-- Trigger-only functions: revoke all execute from PUBLIC/anon/authenticated
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_manager_inkooporder() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_managers_ziekmelding() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_contract_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_kandidaat_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;

-- Rate limit helpers: only used by edge functions via service_role
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_log() FROM PUBLIC, anon, authenticated;

-- Number generators: called from edge functions via service_role
REVOKE EXECUTE ON FUNCTION public.next_contract_nummer() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_inkooporder_nummer() FROM PUBLIC, anon;

-- has_role: used inside RLS policies; keep available to authenticated only
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
