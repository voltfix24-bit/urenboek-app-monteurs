CREATE OR REPLACE FUNCTION public.get_projects_planning_v1()
RETURNS TABLE (
  id uuid, naam text, nummer text, straat text, postcode text, stad text,
  adres text, soort text, contactpersoon_naam text, contactpersoon_tel text, active boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Niet geautoriseerd' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'uitvoerder') OR public.has_role(auth.uid(), 'wv')) THEN
    RAISE EXCEPTION 'Geen planningsrechten' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT p.id, p.naam, p.nummer, p.straat, p.postcode, p.stad, p.adres, p.soort, p.contactpersoon_naam, p.contactpersoon_tel, p.active FROM public.projects p;
END;
$$;
REVOKE ALL ON FUNCTION public.get_projects_planning_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_projects_planning_v1() TO authenticated, service_role;