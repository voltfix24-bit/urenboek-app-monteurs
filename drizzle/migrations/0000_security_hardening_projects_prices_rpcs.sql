-- 1) Planner sync RPC's: alleen service_role (idempotent; bevestigt productie-fix)
REVOKE ALL ON FUNCTION public.adopt_planner_planning_item_v1(uuid, text, date, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_planner_planning_item_v1(uuid, text, date, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_planner_planning_update_v1(uuid, text, date, uuid, uuid, time without time zone, time without time zone, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_planner_planning_delete_v1(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adopt_planner_planning_item_v1(uuid, text, date, uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_planner_planning_item_v1(uuid, text, date, uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_planner_planning_update_v1(uuid, text, date, uuid, uuid, time without time zone, time without time zone, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_planner_planning_delete_v1(uuid, text) TO service_role;

-- Manager-only RPC's (controleren zelf rol) niet meer voor PUBLIC/anon
REVOKE EXECUTE ON FUNCTION public.get_planner_sync_status_summary_v1() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_planner_planning_sync_audit_v1(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_planner_soft_deleted_planning_v1(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_planner_conflict_keuze_v1(text, date, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_planner_planning_soft_delete_v1(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.koppel_monteur_aan_onderaannemer(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_planner_sync_status_summary_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_planner_planning_sync_audit_v1(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_planner_soft_deleted_planning_v1(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_planner_conflict_keuze_v1(text, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_planner_planning_soft_delete_v1(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.koppel_monteur_aan_onderaannemer(uuid, uuid, text) TO authenticated;

-- 2) Tarieven: geen anon-toegang; RLS blijft manager-only
REVOKE ALL ON public.spec_code_tarieven FROM anon;

-- 3) Projects: kolomgebonden leesrechten voor authenticated (whitelist)
REVOKE ALL ON public.projects FROM anon;
REVOKE SELECT ON public.projects FROM authenticated;
GRANT SELECT (id, nummer, naam, active, status, stationsnaam, adres, straat, postcode, stad, case_type)
  ON public.projects TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.projects TO authenticated; -- RLS: alleen managers
GRANT ALL ON public.projects TO service_role;

-- Views: alleen veilige kolommen, security_invoker
DROP VIEW IF EXISTS public.projects_public;
DROP VIEW IF EXISTS public.projects_monteur;
CREATE VIEW public.projects_monteur WITH (security_invoker = true) AS
  SELECT id, nummer, naam, active, status, stationsnaam, adres, straat, postcode, stad, case_type
  FROM public.projects;
REVOKE ALL ON public.projects_monteur FROM anon, PUBLIC;
GRANT SELECT ON public.projects_monteur TO authenticated;
GRANT SELECT ON public.projects_monteur TO service_role;

-- Volledige projectgegevens: alleen managers via RPC
CREATE OR REPLACE FUNCTION public.get_projects_admin_v1()
RETURNS SETOF public.projects
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Niet geautoriseerd' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(auth.uid(), 'manager') THEN
    RAISE EXCEPTION 'Alleen managers' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.projects;
END;
$$;
REVOKE ALL ON FUNCTION public.get_projects_admin_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_projects_admin_v1() TO authenticated, service_role;