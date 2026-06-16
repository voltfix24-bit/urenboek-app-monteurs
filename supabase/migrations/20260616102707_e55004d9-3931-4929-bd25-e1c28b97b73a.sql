CREATE OR REPLACE FUNCTION public.sync_planner_planning_item_v1(_manager_profile_id uuid, _external_id text, _datum date, _project_id uuid, _medewerker_id uuid, _activiteit text, _kleur text, _notitie text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_id uuid;
  _existing_id uuid;
  _handmatig_count int;
BEGIN
  -- Serialize concurrent attempts voor exact dezelfde externe ID
  PERFORM pg_advisory_xact_lock(hashtext('planner_planning_sync:' || _external_id));

  -- Idempotent: zelfde externe ID al aanwezig?
  SELECT id INTO _existing_id
    FROM public.planning
    WHERE external_source = 'terrevolt_planner'
      AND external_id = _external_id
    LIMIT 1;
  IF _existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'uitkomst', 'reeds_gesynchroniseerd',
      'planning_id', _existing_id
    );
  END IF;

  -- Handmatige planning voor zelfde monteur en datum blijft blokkeren (handmatige overlap).
  SELECT count(*) INTO _handmatig_count
    FROM public.planning
   WHERE medewerker_id = _medewerker_id
     AND datum = _datum
     AND (external_source IS NULL OR external_source <> 'terrevolt_planner');
  IF _handmatig_count > 0 THEN
    RETURN jsonb_build_object('uitkomst','geweigerd','fout_reden','overlap_handmatige_planning');
  END IF;

  -- Meerdere Planner-regels (verschillende external_id) voor zelfde monteur/datum zijn toegestaan:
  -- Planner kan een monteur op meerdere cellen/projecten op dezelfde dag plannen. Idempotentie
  -- is gewaarborgd door de UNIEKE combinatie external_source + external_id.

  INSERT INTO public.planning (
    medewerker_id, project_id, datum,
    starttijd, eindtijd, notitie,
    created_by,
    activiteit, activiteit_kleur,
    external_source, external_id, external_updated_at, sync_locked
  ) VALUES (
    _medewerker_id, _project_id, _datum,
    '07:00:00', '16:00:00', COALESCE(_notitie, ''),
    _manager_profile_id,
    _activiteit, _kleur,
    'terrevolt_planner', _external_id, now(), true
  )
  RETURNING id INTO _new_id;

  RETURN jsonb_build_object('uitkomst','gesynchroniseerd','planning_id', _new_id);
EXCEPTION
  WHEN unique_violation THEN
    -- Race: andere transactie heeft net de externe ID ingevoegd.
    SELECT id INTO _existing_id
      FROM public.planning
      WHERE external_source = 'terrevolt_planner'
        AND external_id = _external_id
      LIMIT 1;
    RETURN jsonb_build_object('uitkomst','reeds_gesynchroniseerd','planning_id', _existing_id);
END;
$function$;