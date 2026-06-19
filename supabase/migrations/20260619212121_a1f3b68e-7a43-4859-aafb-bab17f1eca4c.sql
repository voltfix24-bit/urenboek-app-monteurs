CREATE OR REPLACE FUNCTION public.list_planner_planning_sync_audit_v1(_limit int DEFAULT 200)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  manager_user_id uuid,
  manager_naam text,
  external_id text,
  datum date,
  planning_id uuid,
  uitkomst text,
  fout_reden text,
  project_nummer text,
  project_naam text,
  monteur_naam text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lim int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Niet geautoriseerd' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(auth.uid(), 'manager') THEN
    RAISE EXCEPTION 'Alleen managers' USING ERRCODE = '42501';
  END IF;
  _lim := GREATEST(1, LEAST(COALESCE(_limit, 200), 500));

  RETURN QUERY
  SELECT a.id, a.created_at, a.manager_user_id,
         mp.full_name AS manager_naam,
         a.external_id, a.datum, a.planning_id, a.uitkomst, a.fout_reden,
         pr.nummer AS project_nummer, pr.naam AS project_naam,
         mo.full_name AS monteur_naam
    FROM public.planner_planning_sync_audit a
    LEFT JOIN public.profiles mp ON mp.user_id = a.manager_user_id
    LEFT JOIN public.planning  pl ON pl.id = a.planning_id
    LEFT JOIN public.projects  pr ON pr.id = pl.project_id
    LEFT JOIN public.profiles  mo ON mo.id = pl.medewerker_id
   ORDER BY a.created_at DESC
   LIMIT _lim;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_planner_planning_sync_audit_v1(int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.list_planner_planning_sync_audit_v1(int) FROM anon;