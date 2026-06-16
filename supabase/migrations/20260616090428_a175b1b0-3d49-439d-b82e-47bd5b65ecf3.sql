
-- Sta nieuwe audit-uitkomsten toe
ALTER TABLE public.planner_planning_sync_audit
  DROP CONSTRAINT IF EXISTS planner_planning_sync_audit_uitkomst_check;
ALTER TABLE public.planner_planning_sync_audit
  ADD CONSTRAINT planner_planning_sync_audit_uitkomst_check
  CHECK (uitkomst = ANY (ARRAY[
    'gesynchroniseerd'::text,
    'reeds_gesynchroniseerd'::text,
    'geadopteerd'::text,
    'reeds_geadopteerd'::text,
    'geweigerd'::text,
    'fout'::text
  ]));

CREATE OR REPLACE FUNCTION public.adopt_planner_planning_item_v1(
  _manager_profile_id uuid,
  _external_id text,
  _datum date,
  _project_id uuid,
  _medewerker_id uuid,
  _activiteit text,
  _kleur text,
  _notitie text
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  _existing_extern_id uuid;
  _kandidaten_count int;
  _kandidaat_id uuid;
  _kandidaat record;
  _andere_handmatig_count int;
  _andere_extern_count int;
  _uren_count int;
  _time_entry_count int;
  _project_nummer text;
  _medewerker_user uuid;
  _new_activiteit text;
  _new_kleur text;
  _new_notitie text;
BEGIN
  -- Serialize concurrent attempts voor exact dezelfde externe ID
  PERFORM pg_advisory_xact_lock(hashtext('planner_planning_adopt:' || _external_id));

  -- Idempotent: externe regel met deze external_id al aanwezig?
  SELECT id INTO _existing_extern_id
    FROM public.planning
   WHERE external_source = 'terrevolt_planner'
     AND external_id = _external_id
   LIMIT 1;

  IF _existing_extern_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'uitkomst','reeds_geadopteerd',
      'planning_id', _existing_extern_id
    );
  END IF;

  -- Tel kandidaten: handmatige regels op (project, monteur, datum) met exact 07:00–16:00.
  SELECT count(*) INTO _kandidaten_count
    FROM public.planning
   WHERE project_id = _project_id
     AND medewerker_id = _medewerker_id
     AND datum = _datum
     AND external_source IS NULL
     AND external_id IS NULL
     AND starttijd = '07:00:00'
     AND eindtijd = '16:00:00';

  IF _kandidaten_count = 0 THEN
    RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','geen_kandidaat');
  END IF;
  IF _kandidaten_count > 1 THEN
    RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','meerdere_kandidaten');
  END IF;

  SELECT id, activiteit, activiteit_kleur, notitie
    INTO _kandidaat
    FROM public.planning
   WHERE project_id = _project_id
     AND medewerker_id = _medewerker_id
     AND datum = _datum
     AND external_source IS NULL
     AND external_id IS NULL
     AND starttijd = '07:00:00'
     AND eindtijd = '16:00:00'
   LIMIT 1;
  _kandidaat_id := _kandidaat.id;

  -- Geen andere handmatige planning voor monteur+datum
  SELECT count(*) INTO _andere_handmatig_count
    FROM public.planning
   WHERE medewerker_id = _medewerker_id
     AND datum = _datum
     AND id <> _kandidaat_id
     AND (external_source IS NULL OR external_source <> 'terrevolt_planner');
  IF _andere_handmatig_count > 0 THEN
    RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','andere_handmatige_regel_zelfde_dag');
  END IF;

  -- Geen andere externe Planner-regel voor monteur+datum
  SELECT count(*) INTO _andere_extern_count
    FROM public.planning
   WHERE medewerker_id = _medewerker_id
     AND datum = _datum
     AND external_source = 'terrevolt_planner';
  IF _andere_extern_count > 0 THEN
    RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','andere_planner_regel_zelfde_dag');
  END IF;

  -- Geen urenboekingen voor monteur+project+datum
  SELECT count(*) INTO _uren_count
    FROM public.uren_boekingen
   WHERE medewerker_id = _medewerker_id
     AND project_id = _project_id
     AND datum = _datum;
  IF _uren_count > 0 THEN
    RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','urenboekingen_aanwezig');
  END IF;

  -- Geen time_entries voor monteur(user_id)+project(nummer)+datum
  SELECT nummer INTO _project_nummer FROM public.projects WHERE id = _project_id;
  SELECT user_id INTO _medewerker_user FROM public.profiles WHERE id = _medewerker_id;
  IF _project_nummer IS NOT NULL AND _medewerker_user IS NOT NULL THEN
    SELECT count(*) INTO _time_entry_count
      FROM public.time_entries
     WHERE user_id = _medewerker_user
       AND project_number = _project_nummer
       AND date = _datum;
    IF _time_entry_count > 0 THEN
      RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','time_entries_aanwezig');
    END IF;
  END IF;

  -- Velden alleen aanvullen als leeg
  _new_activiteit := CASE
    WHEN _kandidaat.activiteit IS NULL OR length(btrim(_kandidaat.activiteit)) = 0
      THEN _activiteit ELSE _kandidaat.activiteit END;
  _new_kleur := CASE
    WHEN _kandidaat.activiteit_kleur IS NULL OR length(btrim(_kandidaat.activiteit_kleur)) = 0
      THEN _kleur ELSE _kandidaat.activiteit_kleur END;
  _new_notitie := CASE
    WHEN _kandidaat.notitie IS NULL OR length(btrim(_kandidaat.notitie)) = 0
      THEN COALESCE(_notitie, '') ELSE _kandidaat.notitie END;

  UPDATE public.planning
     SET external_source = 'terrevolt_planner',
         external_id = _external_id,
         external_updated_at = now(),
         sync_locked = true,
         activiteit = _new_activiteit,
         activiteit_kleur = _new_kleur,
         notitie = _new_notitie
   WHERE id = _kandidaat_id;

  RETURN jsonb_build_object('uitkomst','geadopteerd','planning_id', _kandidaat_id);
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO _existing_extern_id
      FROM public.planning
      WHERE external_source = 'terrevolt_planner'
        AND external_id = _external_id
      LIMIT 1;
    RETURN jsonb_build_object('uitkomst','reeds_geadopteerd','planning_id', _existing_extern_id);
END;
$$;
