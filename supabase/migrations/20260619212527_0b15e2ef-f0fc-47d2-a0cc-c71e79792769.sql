-- 1. Audit constraint uitbreiden
ALTER TABLE public.planner_planning_sync_audit
  DROP CONSTRAINT IF EXISTS planner_planning_sync_audit_uitkomst_check;
ALTER TABLE public.planner_planning_sync_audit
  ADD CONSTRAINT planner_planning_sync_audit_uitkomst_check
  CHECK (uitkomst = ANY (ARRAY[
    'gesynchroniseerd','reeds_gesynchroniseerd',
    'geadopteerd','reeds_geadopteerd',
    'bijgewerkt','overgeslagen','geweigerd','fout',
    'verwijderd','gemarkeerd_verwijderd',
    'hersteld','reeds_actief',
    'keuze_terrevolt','keuze_planner','keuze_overslaan'
  ]));

-- 2. Restore RPC: zet external_deleted_at terug, sluit weer aan op sync.
CREATE OR REPLACE FUNCTION public.restore_planner_planning_soft_delete_v1(_external_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_uid uuid := auth.uid();
  _bestaand record;
BEGIN
  IF _caller_uid IS NULL THEN
    RAISE EXCEPTION 'Niet geautoriseerd' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(_caller_uid, 'manager') THEN
    RAISE EXCEPTION 'Alleen managers' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('planner_planning_restore:' || _external_id));

  SELECT id, datum, external_deleted_at
    INTO _bestaand
    FROM public.planning
   WHERE external_source = 'terrevolt_planner'
     AND external_id = _external_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.planner_planning_sync_audit
      (manager_user_id, external_id, datum, planning_id, uitkomst, fout_reden)
    VALUES (_caller_uid, _external_id, CURRENT_DATE, NULL, 'fout', 'bestaande_extern_niet_gevonden');
    RETURN jsonb_build_object('uitkomst','fout','fout_reden','bestaande_extern_niet_gevonden');
  END IF;

  IF _bestaand.external_deleted_at IS NULL THEN
    INSERT INTO public.planner_planning_sync_audit
      (manager_user_id, external_id, datum, planning_id, uitkomst)
    VALUES (_caller_uid, _external_id, _bestaand.datum, _bestaand.id, 'reeds_actief');
    RETURN jsonb_build_object('uitkomst','reeds_actief','planning_id', _bestaand.id);
  END IF;

  UPDATE public.planning
     SET external_deleted_at = NULL,
         sync_locked = true,
         external_updated_at = now()
   WHERE id = _bestaand.id;

  INSERT INTO public.planner_planning_sync_audit
    (manager_user_id, external_id, datum, planning_id, uitkomst)
  VALUES (_caller_uid, _external_id, _bestaand.datum, _bestaand.id, 'hersteld');

  RETURN jsonb_build_object('uitkomst','hersteld','planning_id', _bestaand.id);
END;
$$;

-- 3. Log conflict keuze (geen data-mutatie; alleen audit van manager-keuze)
CREATE OR REPLACE FUNCTION public.log_planner_conflict_keuze_v1(
  _external_id text,
  _datum date,
  _keuze text,
  _toelichting text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_uid uuid := auth.uid();
  _uitkomst text;
  _planning_id uuid;
BEGIN
  IF _caller_uid IS NULL THEN
    RAISE EXCEPTION 'Niet geautoriseerd' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(_caller_uid, 'manager') THEN
    RAISE EXCEPTION 'Alleen managers' USING ERRCODE = '42501';
  END IF;

  IF _external_id IS NULL OR length(btrim(_external_id)) = 0 THEN
    RAISE EXCEPTION 'external_id verplicht' USING ERRCODE = '22023';
  END IF;
  IF _datum IS NULL THEN
    RAISE EXCEPTION 'datum verplicht' USING ERRCODE = '22023';
  END IF;

  _uitkomst := CASE _keuze
    WHEN 'terrevolt' THEN 'keuze_terrevolt'
    WHEN 'planner'   THEN 'keuze_planner'
    WHEN 'overslaan' THEN 'keuze_overslaan'
    ELSE NULL
  END;
  IF _uitkomst IS NULL THEN
    RAISE EXCEPTION 'Ongeldige keuze' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO _planning_id
    FROM public.planning
   WHERE external_source = 'terrevolt_planner' AND external_id = _external_id
   LIMIT 1;

  INSERT INTO public.planner_planning_sync_audit
    (manager_user_id, external_id, datum, planning_id, uitkomst, fout_reden)
  VALUES (_caller_uid, _external_id, _datum, _planning_id, _uitkomst,
          NULLIF(btrim(coalesce(_toelichting,'')), ''));

  RETURN jsonb_build_object('uitkomst', _uitkomst, 'planning_id', _planning_id);
END;
$$;

-- 4. Lijst van soft-deleted externe Planner-regels (voor herstel-UI)
CREATE OR REPLACE FUNCTION public.list_planner_soft_deleted_planning_v1(_limit int DEFAULT 100)
RETURNS TABLE (
  planning_id uuid,
  external_id text,
  datum date,
  external_deleted_at timestamptz,
  project_nummer text,
  project_naam text,
  monteur_naam text,
  activiteit text,
  notitie text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _lim int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Niet geautoriseerd' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_role(auth.uid(), 'manager') THEN RAISE EXCEPTION 'Alleen managers' USING ERRCODE = '42501'; END IF;
  _lim := GREATEST(1, LEAST(COALESCE(_limit, 100), 500));

  RETURN QUERY
  SELECT p.id, p.external_id, p.datum, p.external_deleted_at,
         pr.nummer, pr.naam, mo.full_name,
         p.activiteit, p.notitie
    FROM public.planning p
    LEFT JOIN public.projects pr ON pr.id = p.project_id
    LEFT JOIN public.profiles mo ON mo.id = p.medewerker_id
   WHERE p.external_source = 'terrevolt_planner'
     AND p.external_deleted_at IS NOT NULL
   ORDER BY p.external_deleted_at DESC
   LIMIT _lim;
END;
$$;

-- 5. Korte status-samenvatting voor dashboardbalk
CREATE OR REPLACE FUNCTION public.get_planner_sync_status_summary_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _laatste_succes timestamptz;
  _laatste_succes_uitkomst text;
  _laatste_fout timestamptz;
  _laatste_fout_reden text;
  _open_soft_deleted int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Niet geautoriseerd' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_role(auth.uid(), 'manager') THEN RAISE EXCEPTION 'Alleen managers' USING ERRCODE = '42501'; END IF;

  SELECT created_at, uitkomst INTO _laatste_succes, _laatste_succes_uitkomst
    FROM public.planner_planning_sync_audit
   WHERE uitkomst IN ('gesynchroniseerd','geadopteerd','bijgewerkt','verwijderd','gemarkeerd_verwijderd','hersteld')
   ORDER BY created_at DESC LIMIT 1;

  SELECT created_at, fout_reden INTO _laatste_fout, _laatste_fout_reden
    FROM public.planner_planning_sync_audit
   WHERE uitkomst IN ('fout','geweigerd')
   ORDER BY created_at DESC LIMIT 1;

  SELECT count(*) INTO _open_soft_deleted
    FROM public.planning
   WHERE external_source = 'terrevolt_planner'
     AND external_deleted_at IS NOT NULL;

  RETURN jsonb_build_object(
    'laatste_succes', _laatste_succes,
    'laatste_succes_uitkomst', _laatste_succes_uitkomst,
    'laatste_fout', _laatste_fout,
    'laatste_fout_reden', _laatste_fout_reden,
    'open_soft_deleted', _open_soft_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_planner_planning_soft_delete_v1(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_planner_conflict_keuze_v1(text, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_planner_soft_deleted_planning_v1(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_planner_sync_status_summary_v1() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_planner_planning_soft_delete_v1(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_planner_conflict_keuze_v1(text, date, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_planner_soft_deleted_planning_v1(int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_planner_sync_status_summary_v1() FROM anon;