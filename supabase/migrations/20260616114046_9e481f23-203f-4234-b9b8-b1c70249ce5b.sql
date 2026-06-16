-- 1. Kolom external_deleted_at toevoegen
ALTER TABLE public.planning
  ADD COLUMN IF NOT EXISTS external_deleted_at timestamptz;

-- 2. Audit-constraint uitbreiden met 'verwijderd' en 'gemarkeerd_verwijderd'
ALTER TABLE public.planner_planning_sync_audit
  DROP CONSTRAINT IF EXISTS planner_planning_sync_audit_uitkomst_check;
ALTER TABLE public.planner_planning_sync_audit
  ADD CONSTRAINT planner_planning_sync_audit_uitkomst_check
  CHECK (uitkomst = ANY (ARRAY[
    'gesynchroniseerd','reeds_gesynchroniseerd',
    'geadopteerd','reeds_geadopteerd',
    'bijgewerkt','overgeslagen','geweigerd','fout',
    'verwijderd','gemarkeerd_verwijderd'
  ]));

-- 3. RPC: veilige verwijdering / markering
CREATE OR REPLACE FUNCTION public.sync_planner_planning_delete_v1(
  _manager_profile_id uuid,
  _external_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _bestaand record;
  _uren_count int;
  _te_count int;
  _project_nummer text;
  _medewerker_user uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('planner_planning_delete:' || _external_id));

  SELECT id, datum, project_id, medewerker_id, external_deleted_at
    INTO _bestaand
    FROM public.planning
   WHERE external_source = 'terrevolt_planner'
     AND external_id = _external_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('uitkomst','overgeslagen','fout_reden','bestaande_extern_niet_gevonden');
  END IF;

  -- Tellen: urenboekingen op (monteur, project, datum)
  SELECT count(*) INTO _uren_count
    FROM public.uren_boekingen
   WHERE medewerker_id = _bestaand.medewerker_id
     AND project_id = _bestaand.project_id
     AND datum = _bestaand.datum;

  -- Tellen: time_entries (via project nummer + user_id)
  SELECT nummer INTO _project_nummer FROM public.projects WHERE id = _bestaand.project_id;
  SELECT user_id INTO _medewerker_user FROM public.profiles WHERE id = _bestaand.medewerker_id;
  _te_count := 0;
  IF _project_nummer IS NOT NULL AND _medewerker_user IS NOT NULL THEN
    SELECT count(*) INTO _te_count
      FROM public.time_entries
     WHERE user_id = _medewerker_user
       AND project_number = _project_nummer
       AND date = _bestaand.datum;
  END IF;

  IF _uren_count = 0 AND _te_count = 0 THEN
    -- Veilig hard verwijderen (ook als al gemarkeerd: leegmaken want geen boekingen)
    DELETE FROM public.planning WHERE id = _bestaand.id;
    RETURN jsonb_build_object('uitkomst','verwijderd','planning_id', _bestaand.id);
  END IF;

  -- Boekingen bestaan: markeer (idempotent)
  IF _bestaand.external_deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('uitkomst','overgeslagen','fout_reden','reeds_gemarkeerd','planning_id', _bestaand.id);
  END IF;

  UPDATE public.planning
     SET external_deleted_at = now(),
         sync_locked = false,
         external_updated_at = now()
   WHERE id = _bestaand.id;

  RETURN jsonb_build_object('uitkomst','gemarkeerd_verwijderd','planning_id', _bestaand.id);
END;
$function$;