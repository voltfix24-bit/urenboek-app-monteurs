
ALTER TABLE public.planner_planning_sync_audit DROP CONSTRAINT IF EXISTS planner_planning_sync_audit_uitkomst_check;
ALTER TABLE public.planner_planning_sync_audit ADD CONSTRAINT planner_planning_sync_audit_uitkomst_check
  CHECK (uitkomst = ANY (ARRAY[
    'gesynchroniseerd','reeds_gesynchroniseerd',
    'geadopteerd','reeds_geadopteerd',
    'bijgewerkt','overgeslagen',
    'geweigerd','fout'
  ]));

CREATE OR REPLACE FUNCTION public.sync_planner_planning_update_v1(
  _manager_profile_id uuid,
  _external_id text,
  _datum date,
  _project_id uuid,
  _medewerker_id uuid,
  _starttijd time,
  _eindtijd time,
  _activiteit text,
  _kleur text,
  _notitie text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bestaand record;
  _uren_old int;
  _uren_new int;
  _te_old int;
  _te_new int;
  _handmatig int;
  _andere_extern int;
  _project_nummer text;
  _medewerker_user uuid;
  _old_project_nummer text;
  _old_medewerker_user uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('planner_planning_update:' || _external_id));

  SELECT id, datum, starttijd, eindtijd, project_id, medewerker_id,
         activiteit, activiteit_kleur, notitie, external_source, external_id, sync_locked
    INTO _bestaand
    FROM public.planning
   WHERE external_source = 'terrevolt_planner'
     AND external_id = _external_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','bestaande_extern_niet_gevonden');
  END IF;

  -- Niets te doen?
  IF _bestaand.datum = _datum
     AND _bestaand.project_id = _project_id
     AND _bestaand.medewerker_id = _medewerker_id
     AND _bestaand.starttijd = _starttijd
     AND _bestaand.eindtijd = _eindtijd
     AND COALESCE(btrim(_bestaand.activiteit),'') = COALESCE(btrim(_activiteit),'')
     AND COALESCE(btrim(_bestaand.activiteit_kleur),'') = COALESCE(btrim(_kleur),'')
     AND COALESCE(btrim(_bestaand.notitie),'') = COALESCE(btrim(_notitie),'')
  THEN
    RETURN jsonb_build_object('uitkomst','overgeslagen','fout_reden','geen_wijzigingen','planning_id', _bestaand.id);
  END IF;

  -- Urenboekingen op OUDE en NIEUWE (monteur, project, datum)
  SELECT count(*) INTO _uren_old
    FROM public.uren_boekingen
   WHERE medewerker_id = _bestaand.medewerker_id
     AND project_id = _bestaand.project_id
     AND datum = _bestaand.datum;
  IF _uren_old > 0 THEN
    RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','urenboekingen_aanwezig_oud','planning_id', _bestaand.id);
  END IF;

  SELECT count(*) INTO _uren_new
    FROM public.uren_boekingen
   WHERE medewerker_id = _medewerker_id
     AND project_id = _project_id
     AND datum = _datum;
  IF _uren_new > 0 THEN
    RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','urenboekingen_aanwezig_nieuw','planning_id', _bestaand.id);
  END IF;

  -- time_entries (via project nummer + user_id)
  SELECT nummer INTO _old_project_nummer FROM public.projects WHERE id = _bestaand.project_id;
  SELECT user_id INTO _old_medewerker_user FROM public.profiles WHERE id = _bestaand.medewerker_id;
  IF _old_project_nummer IS NOT NULL AND _old_medewerker_user IS NOT NULL THEN
    SELECT count(*) INTO _te_old
      FROM public.time_entries
     WHERE user_id = _old_medewerker_user
       AND project_number = _old_project_nummer
       AND date = _bestaand.datum;
    IF _te_old > 0 THEN
      RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','time_entries_aanwezig_oud','planning_id', _bestaand.id);
    END IF;
  END IF;

  SELECT nummer INTO _project_nummer FROM public.projects WHERE id = _project_id;
  SELECT user_id INTO _medewerker_user FROM public.profiles WHERE id = _medewerker_id;
  IF _project_nummer IS NULL THEN
    RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','project_niet_gevonden');
  END IF;
  IF _medewerker_user IS NULL THEN
    RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','monteur_niet_gevonden');
  END IF;
  SELECT count(*) INTO _te_new
    FROM public.time_entries
   WHERE user_id = _medewerker_user
     AND project_number = _project_nummer
     AND date = _datum;
  IF _te_new > 0 THEN
    RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','time_entries_aanwezig_nieuw','planning_id', _bestaand.id);
  END IF;

  -- Handmatige overlap op doel (medewerker_id, datum), behalve eigen regel
  SELECT count(*) INTO _handmatig
    FROM public.planning
   WHERE medewerker_id = _medewerker_id
     AND datum = _datum
     AND id <> _bestaand.id
     AND (external_source IS NULL OR external_source <> 'terrevolt_planner');
  IF _handmatig > 0 THEN
    RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','overlap_handmatige_planning','planning_id', _bestaand.id);
  END IF;

  -- Andere externe Planner-regel met andere external_id voor dezelfde (medewerker, datum) is toegestaan
  -- (multi-cel/multi-monteur). Uniciteit external_id wordt afgedwongen door constraint.

  UPDATE public.planning
     SET project_id = _project_id,
         medewerker_id = _medewerker_id,
         datum = _datum,
         starttijd = _starttijd,
         eindtijd = _eindtijd,
         activiteit = _activiteit,
         activiteit_kleur = _kleur,
         notitie = COALESCE(_notitie, ''),
         external_updated_at = now(),
         sync_locked = true
   WHERE id = _bestaand.id;

  RETURN jsonb_build_object('uitkomst','bijgewerkt','planning_id', _bestaand.id);
END;
$function$;
