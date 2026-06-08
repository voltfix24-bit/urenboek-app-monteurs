
REVOKE EXECUTE ON FUNCTION public.is_onderaannemer_van(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_onderaannemer_van(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated users can view spec_code_tarieven" ON public.spec_code_tarieven;
CREATE POLICY "Managers can view spec_code_tarieven"
  ON public.spec_code_tarieven FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::app_role));

DROP POLICY IF EXISTS "Onderaannemer can view own monteurs profiles" ON public.profiles;

CREATE OR REPLACE VIEW public.monteurs_voor_onderaannemer
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.user_id,
  p.full_name,
  p.email,
  p.telefoon,
  p.adres,
  p.bedrijfsnaam,
  p.is_onderaannemer,
  p.onderaannemer_id,
  p.account_status,
  p.activated_at,
  p.invited_at,
  p.avatar_url,
  p.contract_einddatum,
  p.onboarding_voltooid,
  p.onboarding_voltooid_op,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE public.is_onderaannemer_van(auth.uid(), p.id);

GRANT SELECT ON public.monteurs_voor_onderaannemer TO authenticated;
