DROP VIEW IF EXISTS public.monteurs_voor_onderaannemer;

CREATE VIEW public.monteurs_voor_onderaannemer
WITH (security_invoker = false) AS
SELECT
  p.id,
  p.full_name,
  p.is_onderaannemer,
  p.onderaannemer_id,
  p.account_status
FROM public.profiles p
WHERE public.is_onderaannemer_van(auth.uid(), p.id);

GRANT SELECT ON public.monteurs_voor_onderaannemer TO authenticated;